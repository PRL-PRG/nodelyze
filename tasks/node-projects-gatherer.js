const fs = require("fs");

const async = require("async");

const utils = require("../modules/utils.js");
const gh_api = require("../modules/gh-api.js");



function RemoveMetadataUrls(p) {
    p.save_ = false;
    for (let key of Object.keys(p.metadata)) {
        if (key.endsWith("_url") && p.metadata[key] && p.metadata[key].startsWith("https://api.github.com")) {
            delete p.metadata[key];
            p.save_ = true;
        }
    }
}

function UpdateProjectLanguages(p, callback) {
    if (p.languages === undefined || p.force_) {
        gh_api.GetProjectLanguages(p.metadata.full_name, (err, result) => {
            if (err)
                return callback(err);
            p.languages = result;
            p.save_ = true;
            callback(null, p);
        });
    } else {
        callback(null, p);
    }
}

function UpdateProjectIssues(p, callback) {
    if (p.issues === undefined || p.force_) {
        gh_api.GetProjectIssuesCount(p.metadata.full_name, (err, result) => {
            if (err)
                return callback(err);
            p.issues = {
                total : result,
                open : p.metadata.open_issues
            };
            delete p.metadata.open_issues;
            p.save_ = true;
            callback(null, p);
        });
    } else {
        callback(null, p);
    }
}

function UpdateProjectContributors(p, callback) {
    if (p.contributors === undefined || p.force_) {
        gh_api.GetProjectContributorsCount(p.metadata.full_name, (err, result) => {
            if (err)
                return callback(err);
            p.contributors = {
                total : result
            };
            p.save_ = true;
            callback(null, p);
        });
    } else {
        callback(null, p);
    }
}

function UpdateProjectCommits(p, callback) {
    if (p.commits === undefined || p.force_) {
        gh_api.GetProjectCommitsCount(p.metadata.full_name, (err, result) => {
            if (err)
                return callback(err);
            p.commits = {
                total : result
            };
            p.save_ = true;
            callback(null, p);
        });
    } else {
        callback(null, p);
    }
}

function UpdateProjectTopics(p, callback) {
    if (p.metadata.topics === undefined || p.force_) {
        gh_api.GetProjectTopics(p.metadata.full_name, (err, result) => {
            if (err)
                return callback(err);
            p.metadata.topics = result;
            p.save_ = true;
            callback(null, p);
        });
    } else {
        callback(null, p);
    }
}

function RecursiveDependencies(p, pkgs) {
    let result = {};
    let Q = []
    if (! p.packageJson.dependencies) {
        p.recursiveDeps = 0;
        return [];
    }
    for (let dep of Object.keys(p.packageJson.dependencies))
        Q.push(pkgs[dep]);
    while (Q.length > 0) {
        let pkg = Q.shift();
        if (pkg === undefined)
            continue;
        for (let dep of pkg.deps) {
            if (result[dep] === undefined) {
                Q.push(pkgs[dep]);
                result[dep] = true;
            }
        }
    }
    p.recursiveDeps = Object.keys(result).length;
    return Object.keys(result);
}


module.exports = {


    UpdateDataset(settings, callback, force) {
        let done = false;
        let totalProjects = null;
        let projects = 0;
        let t = 0;
        let Q = async.queue((projectFile, callback) => {
            module.exports.UpdateProject(projectFile, (err) => { ++projects; callback(err); }, force);
        }, 50);
        Q.drain = () => {
            if (done) {
                clearInterval(i);
                callback(null);
            }
        };
//        let stride = 0;
        utils.EnqueueAllFiles(Q, settings.projects_dir, (x) => {
/*            if (stride++ % 3 != 0)
                return undefined; */
            return x;
        }, (err, stats) => {
            if (err) return callback(err);
            console.log("Done reading input files:");
            totalProjects = (stats.total - stats.skipped);
            console.log("  total valid files: " + totalProjects);
            if (stats.skipped == stats.total || stats.total === 0)
                callback(null);
            else
                done = true;
        });
        let i = setInterval(() => {
            t += 60;
            let txt = "T: " + utils.ToHMS(t) + ", R: " + gh_api.RequestsCounter() + ", P: " + projects;
            if (totalProjects) {
                let ratio = projects/totalProjects;
                txt += ", %: " + Math.floor(ratio * 10000) / 100;
                txt += ", ETA: " + utils.ToHMS(t / projects * totalProjects);
            }
            console.log(txt);
        }, 60000)
    },

    /** Updates information for given project. If force is true, updates the project information even if it already exists, i.e. reloads the data.
     */
    UpdateProject(projectFile, callback, force = false) {
        async.waterfall([
            (callback) => {
                fs.readFile(projectFile, "utf-8", callback);
            },
            (contents, callback) => {
                let p = null
                try {
                    p = JSON.parse(contents);
                    if (force)
                        p.force_ = true;
                } catch (e) {
                    console.log("Unable to parse: " + projectFile);
                    return callback(e);
                }
                if (!p) {
                    console.log("projectFile: " + projectFile);
                }
                if (!p.metadata) {
                    console.log("Missing metadata: " + projectFile);
                    return callback("err");
                }
                RemoveMetadataUrls(p);
                callback(null, p);
            },
            UpdateProjectLanguages,
            UpdateProjectIssues,
            UpdateProjectContributors,
            UpdateProjectCommits,
            UpdateProjectTopics,
            (p, callback) => {
                if (p.force_)
                    delete p.force_;
                if (p.save_) {
                    delete p.save_;
                    fs.writeFile(projectFile, JSON.stringify(p), (err) => {
                        callback(err);
                    });
                } else {
                    callback(null);
                }
            }
        ], (err) => {
            if (err)
                return callback(err);
            return callback(null);
        });
    },

    /** Calculates sizes for projects.

        Each project has its own size, which is the number of bytes of Javascript it uses. We then calculate the size of its dependencies

        // TODO we ignore versions for now, this has to be changed in the future
     */
    CalculateProjectSizes : function(settings, callback) {
        // we start by getting information about the npm packages we have
        let pkgs = {}
        let Q = async.queue((task, callback) => {
            fs.readFile(task, (err, contents) => {
                if (err)
                    return callback(err);
                let pkg = null;
                try {
                    pkg = JSON.parse(contents);
                    if (! pkg.versions)
                        return callback("no versions in package");
                    if (Object.keys(pkg.versions).length != 1)
                        return callback("only one version of package supported for now");
                } catch (e) {
                    return callback(e);
                }
                let v = Object.keys(pkg.versions)[0];
                v = pkg.versions[v];
                if (v.pkg.dependencies === undefined)
                    v.pkg.dependencies = {};
                pkgs[pkg.name] = {
                    ownSize : v.ownSize,
                    deps : Object.keys(v.pkg.dependencies),
                }
                return callback(null);
            });
        }, 8);
        let done = false;
        let projects = 0;
        Q.drain = () => {
            if (done) {
                console.log("NPM packages loaded, total " + Object.keys(pkgs).length);
                let Q2 = async.queue((task, callback) => {
                    // read the file
                    fs.readFile(task, (err, contents) => {
                        if (err)
                            return callback(err);
                        let p = null;
                        try {
                            p = JSON.parse(contents);
                            if (! p.packageJson) {
                                return callback("No packageJson in project data");
                            }
                            if (! p.languages)
                                return callback("No languages in project data");
                            if (! p.languages.JavaScript)
                                p.languages.JavaScript = 0;
                        } catch (e) {
                            return callback(e);
                        }
                        // now calculate project size
                        let deps = RecursiveDependencies(p, pkgs);
                        let depSize = {
                            totalFiles : 0,
                            jsFiles : 0,
                            totalSize : 0,
                            jsSize : 0,
                        };
                        for (let d of deps) {
                            let pkgd = pkgs[d];
                            if (pkgd === undefined)
                                continue;
                            depSize.totalFiles += pkgd.ownSize.totalFiles;
                            depSize.jsFiles += pkgd.ownSize.jsFiles;
                            depSize.totalSize += pkgd.ownSize.totalSize;
                            depSize.jsSize += pkgd.ownSize.jsSize;
                        }
                        p.depSize = depSize;
                        console.log(p.packageJson.name + ": " + p.languages.JavaScript + "/" + p.depSize.jsSize + " -- " + p.recursiveDeps);
                        ++projects;
                        fs.writeFile(task, JSON.stringify(p), (err) => {
                            callback(err);
                        });
                    });
                }, 8);
                let done2 = false;
                Q2.drain = () => {
                    if (done2) {
                        console.log("Analyzed projects: " + projects);
                        callback(null);
                    }
                };
                utils.EnqueueAllFiles(Q2, settings.projects_dir, (x) => x, (err, stats) => {
                    console.log(stats);
                    done2 = true;
                });
            }
        }
        utils.EnqueueAllFiles(Q, settings.npm_packages_dir, (x) => x, (err, stats) => {
            console.log(stats);
            done = true;
        });
    },

    /** Reports project statistics for all projects in the database.
        */
    ReportProjectStats : function(settings, callback) {
        let done = false;
        console.log("# full_name, stargazers, watchers, total issues, open issues, commits, contributors, deps, devDeps, recursiveDeps, jsSize, jsDepSize");
        let Q = async.queue((task, callback) => {
            fs.readFile(task, (err, contents) => {
                if (err)
                    return callback(err);
                let p = null;
                try {
                    p = JSON.parse(contents);
                    if (! p.depSize)
                        return callback("No dependency size information");
                } catch (e) {
                    return callback(e);
                }
                if (!p.packageJson.dependencies)
                    p.packageJson.dependencies = {}
                if (!p.packageJson.devDependencies)
                    p.packageJson.devDependencies = {}
                if (!p.issues.total)
                    p.issues.total = 0;
                if (!p.commits.total)
                    return callback(null);
                try {
                    console.log(
                        '"' + p.metadata.full_name + '",'
                            + p.metadata.stargazers_count + ","
                            + p.metadata.watchers + ","
                            + p.issues.total + ","
                            + p.issues.open + ","
                            + p.commits.total + ","
                            + p.contributors.total + ","
                            + Object.keys(p.packageJson.dependencies).length + ","
                            + Object.keys(p.packageJson.devDependencies).length + ","
                            + p.recursiveDeps + ","
                            + p.languages.JavaScript + ","
                            + p.depSize.jsSize);
                } catch (e) {
                    return callback(e);
                }
                callback(null);
            })
        }, 8);
        Q.drain = () => {
            if (done) {
                callback(null);
            }
        }
        utils.EnqueueAllFiles(Q, settings.projects_dir, (x) => x, (err, stats) => {
            //console.log(stats);
            done2 = true;
        });

        
    },
};
