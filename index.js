/** A simple script to create, update and analyze the lists of node projects and node packages from github.
 */
const fs = require('fs');
JSON.minify = require("node-json-minify");
const async = require("async");

const utils = require("./modules/utils.js");
const gh_api = require("./modules/gh-api.js");


const npm_packages = require("./tasks/npm-packages.js");
const node_projects_gatherer = require("./tasks/node-projects-gatherer.js");


/** Loads the settings from the given external file. The JSON is first minified so that comments, which are not allowed in pure JSON can be present in the configuration file.
 */
function LoadSettings(filename) {
    console.log("reading settings from " + filename);
    let settings = JSON.parse(JSON.minify(fs.readFileSync(filename, "utf-8")));
    console.log("    projects_dir      : " + settings.projects_dir);
    console.log("    npm_packages_dir  : " + settings.npm_packages_dir);
    console.log("    github api tokens : " + settings.github_api_tokens.length);
    return settings;
}

let settings = LoadSettings("settings.json");
gh_api.Initialize(settings);
/*
gh_api.GetProjectContributorsCount("request/request", (err, result) => {
    console.log(result);
})


gh_api.GetProjectContributorsCount("nodejs/node", (err, result) => {
    console.log(result);
})


*/
/*
utils.EnqueueAllFiles(undefined, settings.projects_dir, (filename) => { return undefined }, (err, result) => {
    console.log(err);
    console.log(result);
});
*/
/*
  node_projects_gatherer.UpdateProject("/home/peta/npm-projects/packagejsons/000/0000marcell_2fPomodoro_2dNW", (err) => {
    console.log(err);
})
*/

/*
node_projects_gatherer.UpdateDataset(settings, (err) => {
    console.log(err);
    console.log("DONE");
    process.exit(0);
}, force = false)
*/

/*
node_projects_gatherer.CalculateProjectSizes(settings, (err) => {
    console.log(err);
    console.log("DONE");
    process.exit(0);
})
*/

/*
npm_packages.CalculatePackageSizes(settings, (err) => {
    console.log(err);
    console.log("DONE");
    process.exit(0);
    
})

*/

node_projects_gatherer.ReportProjectStats(settings, (err) => {
  //  console.log(err);
  //  console.log("DONE");
    process.exit(0);
})




