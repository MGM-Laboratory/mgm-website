// Settings for the optimize-images workflow. The default preset of svgo, minus the plugins that can change how an
// SVG behaves once other code points into it. The viewBox is what lets a pattern scale, and ids and class names are
// what CSS and the page can refer to.
export default {
  multipass: true,
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
