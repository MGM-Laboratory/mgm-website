/**
 * A small, safe formula language for computed columns in the data cleaner.
 * It is tokenized, parsed into a tree and interpreted here: no `eval`, no
 * `Function`, no property access, so a formula can only read the row's
 * columns and call the whitelisted functions below.
 *
 *   {Age} * 12                        column references by label or field id
 *   if({Score} >= 8, "high", "low")   strings in single or double quotes
 *   concat(upper({City}), " / ", {Country})
 *   days_between({Start date}, {End date})
 *   {Plan} = "Pro" and not {Starred}
 *
 * Operators, loosest first: `or`, `and`, `not`, comparisons (`= == != <> < <=
 * > >=`), `+ - &` (`&` always joins text), `* / %`, unary minus. Values are
 * numbers, text, booleans or empty (`null`); a failing operation (a
 * division by zero, a date that isn't one) yields empty instead of throwing.
 */

export type ExprValue = number | string | boolean | null;

export type ExprError = { message: string; start: number; end: number };

type Token =
  | { kind: "number"; value: number; start: number; end: number }
  | { kind: "string"; value: string; start: number; end: number }
  | { kind: "column"; value: string; start: number; end: number }
  | { kind: "ident"; value: string; start: number; end: number }
  | { kind: "op"; value: string; start: number; end: number }
  | { kind: "eof"; value: ""; start: number; end: number };

export type ExprNode =
  | { type: "literal"; value: ExprValue; start: number; end: number }
  | { type: "column"; name: string; start: number; end: number }
  | { type: "unary"; op: "-" | "not"; operand: ExprNode; start: number; end: number }
  | { type: "binary"; op: string; left: ExprNode; right: ExprNode; start: number; end: number }
  | { type: "call"; name: string; args: ExprNode[]; start: number; end: number };

class ExprSyntaxError extends Error {
  readonly start: number;
  readonly end: number;
  constructor(message: string, start: number, end: number) {
    super(message);
    this.start = start;
    this.end = end;
  }
}

const OPERATORS = [
  "<=",
  ">=",
  "!=",
  "<>",
  "==",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
  "(",
  ")",
  ",",
];

// A number literal: `12`, `1.5`, `.5`, `3.`, then an optional exponent
// (`1e3`, `2.5E-4`), matched in two steps to keep each pattern linear.
const NUMBER_MANTISSA = /^(?:\d+\.?\d*|\.\d+)/;
const NUMBER_EXPONENT = /^[eE][+-]?\d+/;

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source.charAt(index);
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const start = index;
    if (/[0-9.]/.test(char) && /[0-9]/.test(source[index + (char === "." ? 1 : 0)] ?? "")) {
      const rest = source.slice(index);
      const mantissa = NUMBER_MANTISSA.exec(rest)?.[0] ?? "";
      const exponent = NUMBER_EXPONENT.exec(rest.slice(mantissa.length))?.[0] ?? "";
      const text = mantissa ? mantissa + exponent : char;
      index += text.length;
      tokens.push({ kind: "number", value: Number(text), start, end: index });
      continue;
    }
    if (char === '"' || char === "'") {
      index += 1;
      let value = "";
      while (index < source.length && source.charAt(index) !== char) {
        if (source.charAt(index) === "\\" && index + 1 < source.length) {
          const next = source[index + 1];
          value += next === "n" ? "\n" : next === "t" ? "\t" : next;
          index += 2;
        } else {
          value += source.charAt(index);
          index += 1;
        }
      }
      if (source.charAt(index) !== char) {
        throw new ExprSyntaxError(
          `This text is missing its closing ${char}.`,
          start,
          source.length,
        );
      }
      index += 1;
      tokens.push({ kind: "string", value, start, end: index });
      continue;
    }
    if (char === "{") {
      const close = source.indexOf("}", index + 1);
      if (close < 0) {
        throw new ExprSyntaxError(
          "This column reference is missing its closing }.",
          start,
          source.length,
        );
      }
      const name = source.slice(index + 1, close).trim();
      if (!name) throw new ExprSyntaxError("Put a column name between { and }.", start, close + 1);
      index = close + 1;
      tokens.push({ kind: "column", value: name, start, end: index });
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index));
      const text = match ? match[0] : char;
      index += text.length;
      tokens.push({ kind: "ident", value: text.toLowerCase(), start, end: index });
      continue;
    }
    const op = OPERATORS.find((candidate) => source.startsWith(candidate, index));
    if (op) {
      index += op.length;
      tokens.push({ kind: "op", value: op, start, end: index });
      continue;
    }
    throw new ExprSyntaxError(`"${char}" isn't something a formula understands.`, start, start + 1);
  }
  tokens.push({ kind: "eof", value: "", start: source.length, end: source.length });
  return tokens;
}

type FunctionSpec = { min: number; max: number; help: string };

export const EXPR_FUNCTIONS: Record<string, FunctionSpec> = {
  len: { min: 1, max: 1, help: "len(text): number of characters" },
  lower: { min: 1, max: 1, help: "lower(text)" },
  upper: { min: 1, max: 1, help: "upper(text)" },
  trim: { min: 1, max: 1, help: "trim(text): drops outer spaces" },
  round: { min: 1, max: 2, help: "round(number, digits?)" },
  abs: { min: 1, max: 1, help: "abs(number)" },
  min: { min: 1, max: 50, help: "min(a, b, ...)" },
  max: { min: 1, max: 50, help: "max(a, b, ...)" },
  sum: { min: 1, max: 50, help: "sum(a, b, ...): empty values count as nothing" },
  avg: { min: 1, max: 50, help: "avg(a, b, ...): the mean of the non-empty values" },
  if: { min: 2, max: 3, help: "if(condition, then, else?)" },
  contains: { min: 2, max: 2, help: "contains(text, part): case-insensitive" },
  concat: { min: 1, max: 50, help: "concat(a, b, ...): joins as text" },
  year: { min: 1, max: 1, help: "year(date)" },
  month: { min: 1, max: 1, help: "month(date): 1 to 12" },
  day: { min: 1, max: 1, help: "day(date): 1 to 31" },
  weekday: { min: 1, max: 1, help: "weekday(date): 1 (Monday) to 7 (Sunday)" },
  days_between: {
    min: 2,
    max: 2,
    help: "days_between(from, to): whole days, negative if to is earlier",
  },
  words: { min: 1, max: 1, help: "words(text): number of words" },
  number: { min: 1, max: 1, help: "number(value): text to number, empty when it isn't one" },
  text: { min: 1, max: 1, help: "text(value)" },
  coalesce: { min: 1, max: 50, help: "coalesce(a, b, ...): the first non-empty value" },
};

const KEYWORDS: Record<string, ExprValue> = { true: true, false: false, null: null, empty: null };

const MAX_TOKENS = 2000;
const MAX_NESTING = 64;

class Parser {
  private position = 0;
  private readonly tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek() {
    return this.tokens[this.position];
  }
  private next() {
    const token = this.tokens[this.position];
    this.position += 1;
    return token;
  }
  private isOp(value: string) {
    const token = this.peek();
    return token.kind === "op" && token.value === value;
  }
  private isWord(value: string) {
    const token = this.peek();
    return token.kind === "ident" && token.value === value;
  }

  /**
   * Bounds the recursion of parsing and evaluating: the parser descends once
   * per bracket and per prefix operator, so a formula has at most
   * MAX_TOKENS tokens and MAX_NESTING levels of brackets.
   */
  private checkSize() {
    if (this.tokens.length > MAX_TOKENS) {
      throw new ExprSyntaxError("This formula is too long. Split it into two columns.", 0, 0);
    }
    let depth = 0;
    for (const token of this.tokens) {
      if (token.kind === "op" && token.value === "(") depth += 1;
      if (token.kind === "op" && token.value === ")") depth -= 1;
      if (depth > MAX_NESTING) {
        throw new ExprSyntaxError("This formula nests too many brackets.", 0, 0);
      }
    }
  }

  parse(): ExprNode {
    if (this.peek().kind === "eof") throw new ExprSyntaxError("Write a formula.", 0, 0);
    this.checkSize();
    const node = this.or();
    const rest = this.peek();
    if (rest.kind !== "eof") {
      throw new ExprSyntaxError(
        rest.kind === "op" && rest.value === ")"
          ? "There's a ) without a matching (."
          : "Something is missing between these parts (an operator or a comma?).",
        rest.start,
        rest.end,
      );
    }
    return node;
  }

  private or(): ExprNode {
    let left = this.and();
    while (this.isWord("or")) {
      this.next();
      const right = this.and();
      left = { type: "binary", op: "or", left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private and(): ExprNode {
    let left = this.not();
    while (this.isWord("and")) {
      this.next();
      const right = this.not();
      left = { type: "binary", op: "and", left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private not(): ExprNode {
    if (this.isWord("not")) {
      const token = this.next();
      const operand = this.not();
      return { type: "unary", op: "not", operand, start: token.start, end: operand.end };
    }
    return this.comparison();
  }

  private comparison(): ExprNode {
    let left = this.additive();
    const ops = ["=", "==", "!=", "<>", "<", "<=", ">", ">="];
    while (this.peek().kind === "op" && ops.includes(String(this.peek().value))) {
      const op = String(this.next().value);
      const right = this.additive();
      const normalized = op === "==" ? "=" : op === "<>" ? "!=" : op;
      left = { type: "binary", op: normalized, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private additive(): ExprNode {
    let left = this.multiplicative();
    while (this.isOp("+") || this.isOp("-") || this.isOp("&")) {
      const op = String(this.next().value);
      const right = this.multiplicative();
      left = { type: "binary", op, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private multiplicative(): ExprNode {
    let left = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = String(this.next().value);
      const right = this.unary();
      left = { type: "binary", op, left, right, start: left.start, end: right.end };
    }
    return left;
  }

  private unary(): ExprNode {
    if (this.isOp("-")) {
      const token = this.next();
      const operand = this.unary();
      return { type: "unary", op: "-", operand, start: token.start, end: operand.end };
    }
    if (this.isOp("+")) {
      this.next();
      return this.unary();
    }
    return this.primary();
  }

  private primary(): ExprNode {
    const token = this.next();
    switch (token.kind) {
      case "number":
      case "string":
        return { type: "literal", value: token.value, start: token.start, end: token.end };
      case "column":
        return { type: "column", name: token.value, start: token.start, end: token.end };
      case "ident": {
        if (token.value in KEYWORDS && !this.isOp("(")) {
          return {
            type: "literal",
            value: KEYWORDS[token.value],
            start: token.start,
            end: token.end,
          };
        }
        if (!this.isOp("(")) {
          if (token.value in EXPR_FUNCTIONS) {
            throw new ExprSyntaxError(
              `${token.value} is a function: add its ( ).`,
              token.start,
              token.end,
            );
          }
          throw new ExprSyntaxError(
            `Unknown word "${token.value}". Put column names in braces, like {${token.value}}, and text in quotes.`,
            token.start,
            token.end,
          );
        }
        const spec = (EXPR_FUNCTIONS as Partial<Record<string, FunctionSpec>>)[token.value];
        if (!spec) {
          throw new ExprSyntaxError(
            `There's no function called ${token.value}.`,
            token.start,
            token.end,
          );
        }
        this.next();
        const args: ExprNode[] = [];
        if (!this.isOp(")")) {
          args.push(this.or());
          while (this.isOp(",")) {
            this.next();
            args.push(this.or());
          }
        }
        const close = this.peek();
        if (!this.isOp(")")) {
          throw new ExprSyntaxError(
            `${token.value}( is missing its closing ).`,
            close.start,
            close.end,
          );
        }
        this.next();
        if (args.length < spec.min || args.length > spec.max) {
          const expected =
            spec.min === spec.max
              ? `${spec.min}`
              : spec.max >= 50
                ? `at least ${spec.min}`
                : `${spec.min} or ${spec.max}`;
          throw new ExprSyntaxError(
            `${token.value} takes ${expected} value${expected === "1" ? "" : "s"}, got ${args.length}. Usage: ${spec.help}.`,
            token.start,
            close.end,
          );
        }
        return { type: "call", name: token.value, args, start: token.start, end: close.end };
      }
      case "op":
        if (token.value === "(") {
          const inner = this.or();
          if (!this.isOp(")")) {
            const at = this.peek();
            throw new ExprSyntaxError("This ( is missing its closing ).", token.start, at.end);
          }
          this.next();
          return inner;
        }
        throw new ExprSyntaxError(
          `A value is missing before "${token.value}".`,
          token.start,
          token.end,
        );
      default:
        throw new ExprSyntaxError(
          "The formula ends too early: a value is missing.",
          token.start,
          token.end,
        );
    }
  }
}

export type CompiledExpr = {
  source: string;
  ast: ExprNode;
  /** The column names it references, as written between braces. */
  columns: string[];
};

export type CompileResult = { ok: true; expr: CompiledExpr } | { ok: false; error: ExprError };

function collectColumns(node: ExprNode, into: Set<string>) {
  switch (node.type) {
    case "column":
      into.add(node.name);
      break;
    case "unary":
      collectColumns(node.operand, into);
      break;
    case "binary":
      collectColumns(node.left, into);
      collectColumns(node.right, into);
      break;
    case "call":
      node.args.forEach((arg) => {
        collectColumns(arg, into);
      });
      break;
    default:
      break;
  }
}

/**
 * Parses a formula. With `knownColumns`, references that match none of
 * them (case-insensitively) are reported as errors.
 */
export function compileExpr(
  source: string,
  knownColumns?: (name: string) => boolean,
): CompileResult {
  try {
    const ast = new Parser(tokenize(source)).parse();
    const names = new Set<string>();
    collectColumns(ast, names);
    if (knownColumns) {
      const missing = findColumn(ast, (name) => !knownColumns(name));
      if (missing) {
        return {
          ok: false,
          error: {
            message: `No column called "${missing.name}".`,
            start: missing.start,
            end: missing.end,
          },
        };
      }
    }
    return { ok: true, expr: { source, ast, columns: [...names] } };
  } catch (error) {
    if (error instanceof ExprSyntaxError) {
      return { ok: false, error: { message: error.message, start: error.start, end: error.end } };
    }
    return {
      ok: false,
      error: { message: "That formula can't be read.", start: 0, end: source.length },
    };
  }
}

function findColumn(
  node: ExprNode,
  predicate: (name: string) => boolean,
): Extract<ExprNode, { type: "column" }> | null {
  switch (node.type) {
    case "column":
      return predicate(node.name) ? node : null;
    case "unary":
      return findColumn(node.operand, predicate);
    case "binary":
      return findColumn(node.left, predicate) ?? findColumn(node.right, predicate);
    case "call":
      for (const arg of node.args) {
        const found = findColumn(arg, predicate);
        if (found) return found;
      }
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function isEmpty(value: ExprValue) {
  return value === null || value === "" || (typeof value === "number" && Number.isNaN(value));
}

export function toNumber(value: ExprValue): number | null {
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value ? 1 : 0;
  const text = value.trim().replace(/,(?=\d{3}(\D|$))/g, "");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toText(value: ExprValue): string {
  if (value === null) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e10) / 1e10);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return value;
}

function truthy(value: ExprValue): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  const text = value.trim().toLowerCase();
  return text !== "" && text !== "false" && text !== "no" && text !== "0";
}

/** Parses `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm` or any ISO instant; null otherwise. */
export function toDate(value: ExprValue): Date | null {
  if (value === null || typeof value === "boolean") return null;
  if (typeof value === "number") return null;
  const text = value.trim();
  const plain = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ](\d{2}):(\d{2})$)/.exec(text);
  if (plain) {
    const [, y, m, d, hh = "0", mm = "0"] = plain;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compare(left: ExprValue, right: ExprValue, op: string): boolean {
  if (op === "=" || op === "!=") {
    let equal: boolean;
    if (isEmpty(left) || isEmpty(right)) equal = isEmpty(left) && isEmpty(right);
    else {
      const a = toNumber(left);
      const b = toNumber(right);
      equal =
        a !== null && b !== null && typeof left !== "boolean" && typeof right !== "boolean"
          ? a === b
          : typeof left === "boolean" || typeof right === "boolean"
            ? truthy(left) === truthy(right)
            : toText(left).toLowerCase() === toText(right).toLowerCase();
    }
    return op === "=" ? equal : !equal;
  }
  if (isEmpty(left) || isEmpty(right)) return false;
  const a = toNumber(left);
  const b = toNumber(right);
  let order: number;
  if (a !== null && b !== null) order = a - b;
  else {
    const da = toDate(left);
    const db = toDate(right);
    order = da && db ? da.getTime() - db.getTime() : toText(left).localeCompare(toText(right));
  }
  switch (op) {
    case "<":
      return order < 0;
    case "<=":
      return order <= 0;
    case ">":
      return order > 0;
    default:
      return order >= 0;
  }
}

function arithmetic(op: string, left: ExprValue, right: ExprValue): ExprValue {
  if (op === "&") return toText(left) + toText(right);
  const a = toNumber(left);
  const b = toNumber(right);
  if (op === "+" && (a === null || b === null)) {
    // Text plus anything joins; empty plus a number stays the number.
    if (isEmpty(left)) return right;
    if (isEmpty(right)) return left;
    return toText(left) + toText(right);
  }
  if (a === null || b === null) return null;
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return b === 0 ? null : a / b;
    default:
      return b === 0 ? null : a % b;
  }
}

function numbersOf(values: ExprValue[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    const number = toNumber(value);
    if (number !== null) out.push(number);
  }
  return out;
}

const DAY_MS = 86_400_000;

function callFunction(name: string, args: ExprValue[]): ExprValue {
  const [first, second] = args;
  switch (name) {
    case "len":
      return toText(first).length;
    case "lower":
      return toText(first).toLowerCase();
    case "upper":
      return toText(first).toUpperCase();
    case "trim":
      return toText(first).trim();
    case "round": {
      const value = toNumber(first);
      if (value === null) return null;
      const digits = Math.max(0, Math.min(10, Math.trunc(toNumber(second ?? 0) ?? 0)));
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    }
    case "abs": {
      const value = toNumber(first);
      return value === null ? null : Math.abs(value);
    }
    case "min": {
      const values = numbersOf(args);
      return values.length ? Math.min(...values) : null;
    }
    case "max": {
      const values = numbersOf(args);
      return values.length ? Math.max(...values) : null;
    }
    case "sum":
      return numbersOf(args).reduce((a, b) => a + b, 0);
    case "avg": {
      const values = numbersOf(args);
      return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    }
    case "contains":
      return toText(first).toLowerCase().includes(toText(second).toLowerCase());
    case "concat":
      return args.map(toText).join("");
    case "year":
    case "month":
    case "day":
    case "weekday": {
      const date = toDate(first);
      if (!date) return null;
      if (name === "year") return date.getUTCFullYear();
      if (name === "month") return date.getUTCMonth() + 1;
      if (name === "day") return date.getUTCDate();
      return ((date.getUTCDay() + 6) % 7) + 1;
    }
    case "days_between": {
      const from = toDate(first);
      const to = toDate(second);
      if (!from || !to) return null;
      return Math.round((to.getTime() - from.getTime()) / DAY_MS);
    }
    case "words": {
      const text = toText(first).trim();
      return text ? text.split(/\s+/).length : 0;
    }
    case "number":
      return toNumber(first);
    case "text":
      return toText(first);
    case "coalesce":
      return args.find((value) => !isEmpty(value)) ?? null;
    default:
      return null;
  }
}

/** Resolves `{name}` for one row. */
export type ColumnResolver = (name: string) => ExprValue;

export function evaluate(node: ExprNode, resolve: ColumnResolver): ExprValue {
  switch (node.type) {
    case "literal":
      return node.value;
    case "column":
      return resolve(node.name);
    case "unary": {
      const value = evaluate(node.operand, resolve);
      if (node.op === "not") return !truthy(value);
      const number = toNumber(value);
      return number === null ? null : -number;
    }
    case "binary": {
      if (node.op === "and") {
        return truthy(evaluate(node.left, resolve)) && truthy(evaluate(node.right, resolve));
      }
      if (node.op === "or") {
        return truthy(evaluate(node.left, resolve)) || truthy(evaluate(node.right, resolve));
      }
      const left = evaluate(node.left, resolve);
      const right = evaluate(node.right, resolve);
      if (["=", "!=", "<", "<=", ">", ">="].includes(node.op)) return compare(left, right, node.op);
      return arithmetic(node.op, left, right);
    }
    case "call": {
      if (node.name === "if") {
        const condition = truthy(evaluate(node.args[0], resolve));
        if (condition) return evaluate(node.args[1], resolve);
        return node.args[2] ? evaluate(node.args[2], resolve) : null;
      }
      return callFunction(
        node.name,
        node.args.map((arg) => evaluate(arg, resolve)),
      );
    }
    default:
      return null;
  }
}

/** Compiles and runs a formula once (tests and previews). */
export function runExpr(source: string, resolve: ColumnResolver = () => null): ExprValue {
  const compiled = compileExpr(source);
  if (!compiled.ok) throw new Error(compiled.error.message);
  return evaluate(compiled.expr.ast, resolve);
}
