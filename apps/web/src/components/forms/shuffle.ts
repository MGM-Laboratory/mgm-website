/**
 * Fisher-Yates in place, drawing from `random` once per step from the end,
 * so a seeded generator gives the same order every time. The swap goes
 * through `splice`, which keeps the list's element type.
 */
export function shuffleInPlace<T>(list: T[], random: () => number): T[] {
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    if (swap === index) continue;
    const [last] = list.splice(index, 1);
    const [picked] = list.splice(swap, 1, last);
    list.splice(index, 0, picked);
  }
  return list;
}
