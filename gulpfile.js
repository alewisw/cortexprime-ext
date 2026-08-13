const fs = require('fs');
const gulp = require('gulp');
const prefix = require('gulp-autoprefixer');
const sourcemaps = require('gulp-sourcemaps');
const zip = require('gulp-zip');
const sass = require('gulp-sass')(require('sass'));

/* ----------------------------------------- */
/*  Compile Sass
/* ----------------------------------------- */

// Small error handler helper function.
function handleError(err) {
  console.log(err.toString());
  this.emit('end');
}

const SYSTEM_SCSS = ["scss/**/*.scss"];
function compileScss() {
  // Configure options for sass output. For example, 'expanded' or 'nested'
  let options = {
    outputStyle: 'expanded'
  };
  return gulp.src(SYSTEM_SCSS)
    .pipe(
      sass(options)
        .on('error', handleError)
    )
    .pipe(prefix({
      cascade: false
    }))
    .pipe(gulp.dest("./css"))
}
const css = gulp.series(compileScss);

/* ----------------------------------------- */
/*  Package for distribution
/* ----------------------------------------- */

// Everything Foundry needs at runtime. Anything not listed here (scss sources,
// tests, node_modules, build config, CI files) is deliberately left out of the
// distributed zip.
const PACKAGE_SOURCES = [
  "system.json",
  "template.json",
  "cortexprime.js",
  "README.md",
  "assets/**/*",
  "configs/**/*",
  "css/**/*",
  "lang/**/*",
  "lib/**/*",
  "module/**/*",
  "templates/**/*"
];
const DIST = "./dist";

// system.json is the single source of truth for the package id and version, so
// the zip name always matches the manifest Foundry will read out of it.
function manifest() {
  return JSON.parse(fs.readFileSync("./system.json", "utf8"));
}

function buildPackage() {
  const { id, version } = manifest();
  const filename = `${id}-${version}.zip`;

  // system.json must sit at the root of the archive, so keep paths relative to
  // the project root rather than to each glob's own base.
  return gulp.src(PACKAGE_SOURCES, { base: ".", nodir: true })
    .pipe(zip(filename))
    .pipe(gulp.dest(DIST))
    .on("end", () => console.log(`Packaged ${DIST}/${filename}`));
}

// Compile first so the css/ in the zip can never lag behind scss/.
const packageSystem = gulp.series(compileScss, buildPackage);

/* ----------------------------------------- */
/*  Watch Updates
/* ----------------------------------------- */

function watchUpdates() {
  gulp.watch(SYSTEM_SCSS, css);
}

/* ----------------------------------------- */
/*  Export Tasks
/* ----------------------------------------- */

exports.default = gulp.series(
  compileScss,
  watchUpdates
);
exports.css = css;
exports.package = packageSystem;
