const gulp = require('gulp');
const sass = require('gulp-sass');
const autoprefixer = require('gulp-autoprefixer');
const cssnano = require('gulp-cssnano');
const plumber = require('gulp-plumber');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify-es').default;
const watch = require('gulp-watch');
const nodemon = require('gulp-nodemon');

gulp.task('sass', () => {
  return gulp
    .src('dev/scss/**/*.css')
    .pipe(
        autoprefixer(['last 15 versions', '> 1%', 'ie 8', 'ie 7'], {
            cascade: true
        })
    )
    .pipe(cssnano())
    .pipe(gulp.dest('public/stylesheets'))
});

gulp.task('scripts', () => {
  return gulp
    .src('dev/js/**/*.js')
    .pipe(uglify())
    .pipe(gulp.dest('public/javascripts'))
  
});

gulp.task('watch', () => {
    gulp.watch('dev/scss/**/*.css', gulp.series('sass'));
    //gulp.watch('dev/js/**/*.js', gulp.series('scripts'));
});

gulp.task('server', function() {

    nodemon({

        script: 'app.js',

        watch: ["app.js", "routes/", 'routes/**/*', 'public/*', 'public/*/**'],
        ext: 'js'
        
    }).on('restart', () => {
    gulp.src('app.js')
  });
});

gulp.task('default',  gulp.parallel(
    gulp.parallel('sass'), //, 'scripts'
    gulp.parallel('server'),
    gulp.parallel('watch')
));