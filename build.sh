echo "Npm install...";
npm install;
echo "nopying node modules...";
cp -R node_modules/ public/scripts/node_modules/;
echo "bower install...";
bower install;
echo "building typescript...";
tsc;