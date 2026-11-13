// Settings for the optimize-images workflow. The default preset of svgo, minus the plugins that can change how an
// SVG behaves once other code points into it. The viewBox is what lets a pattern scale, and ids and class names are
// what CSS and the page can refer to.
export default {
  multipass: true,
  // svgo leaves out the final newline by default, and the end-of-file check of pre-commit.ci fails on that
  js2svg: { finalNewline: true },
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          cleanupIds: false,
          inlineStyles: false,
          removeViewBox: false,
        },
      },
    },
  ],
};
