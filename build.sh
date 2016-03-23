bower install
tsc
cd public;
echo "Copying js..."
rsync -Rv ./**/*.js ../../MarieJS-demo/
rsync -Rv ./*.js ../../MarieJS-demo/
echo "Copying bower..."
rsync -Rav ./bower_components ../../MarieJS-demo/
echo "Copying css..."
rsync -Rv ./*.css ../../MarieJS-demo/
rsync -Rv ./**/*.css ../../MarieJS-demo/
echo "Copying html..."
rsync -Rv ./*.html ../../MarieJS-demo/
rsync -Rv ./**/*.html ../../MarieJS-demo/
cd ..;