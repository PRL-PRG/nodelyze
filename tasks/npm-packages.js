const fs = require("fs");
const async = require("async");
const registry = require("all-the-packages");
JSON.minify = require("node-json-minify");

const utils = require("../modules/utils.js");


/** Calculates the own size for a given package.
 */
function CalculatePackageOwnSize(pkg) {
    for (let v of Object.keys(pkg.versions)) {
        if (pkg.versions[v].ownSize === undefined)
            pkg.versions[v].ownSize = {};
        let jsSize = 0;
        let totalSize = 0;
        let jsFiles = 0;
        let totalFiles = 0;
        for (let f of pkg.versions[v].files) {
            f.size = parseInt(f.size);
        }
        for (let f of pkg.versions[v].files) {
            
            totalFiles += 1;
            totalSize += f.size;
            if (f.name.endsWith(".js")) {
                jsFiles += 1;
                jsSize += f.size;
            }
        }
        pkg.versions[v].ownSize.totalFiles = totalFiles;
        pkg.versions[v].ownSize.jsFiles = jsFiles;
        pkg.versions[v].ownSize.totalSize = totalSize;
        pkg.versions[v].ownSize.jsSize = jsSize;
    }
}

/** Returns list of package dependencies.
  */
function RecursiveDependencies(pkg, pkgs) {
    let result = {};
    let Q = [];
    Q.push(pkg);
    while (Q.length > 0) {
        let p = Q.shift();
        if (p === undefined) // we may be missing some packages
            continue;
        for (let dep of p.deps) {
            if (result[dep] === undefined) {
                Q.push(pkgs[dep]);
                result[dep] = true;
            }
        }
    }
    pkg.recursiveDeps = Object.keys(result).length;
    return Object.keys(result);
}

/** Calculates dependencies size for given package.

    The second argument is list of all packages, where for each package we expect to have its own size and dependencies filled in.
 */
function CalculatePackageDepSize(pkg, pkgs) {
    // if the depSize of the package is already known, continue, since we have calculated it
    if (pkg.depSize !== undefined)
        return;
    // get all dependencies recursively
    let deps = RecursiveDependencies(pkg, pkgs);
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
    pkg.depSize = depSize;
}


module.exports = {

    /** Returns information for the package with given name. If the package does not exists, returns no error, but null as the package information. 
     */
    LoadPackage : function(settings, packageName, callback) {
        let filename = utils.Mangle(packageName);
        fs.readFile(settings.npm_packages_dir + "/" + filename.substr(0, 2) + "/" + packageName, (err, contents) => {
            if (err)
                return callback(null, null);
            try {
                return callback(null, JSON.parse(JSON.minify(contents)));
            } catch (e) {
                return callback("Unable to parse project data for: " + packageName);
            }
        });
    },

    /** Saves the given package information.
     */
    SavePackage : function(settings, p, callback) {
        if (p.save_) {
            delete p.save_;
            let filename = utils.Mangle(p.name)
            utils.SaveFile(settings.npm_packages_dir + "/" + p.name.substr(0, 2) + "/" + filename, callback);
        } else {
            callback(null);
        }
    },

    /** Calculates the package's own and dependency sizes.

        TODO for now, only works with single version per package. 
     */
    CalculatePackageSizes : function (settings, callback) {
        let p = {};
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
                CalculatePackageOwnSize(pkg);
                let v = Object.keys(pkg.versions)[0];
                v = pkg.versions[v];
                if (v.pkg.dependencies === undefined)
                    v.pkg.dependencies = {};
                p[pkg.name] = {
                    ownSize : v.ownSize,
                    deps : Object.keys(v.pkg.dependencies),
                }
                return callback(null); // do not save so that we do not corrupt data
            })
        }, 8);
        let done = false;
        Q.drain = () => {
            if (done) {
                console.log("  own sizes calculated, analyzing dep sizes");
                console.log("  packages kept: " + Object.keys(p).length);
                for (let pname of Object.keys(p)) {
                    console.log(pname);
                    let pkg = p[pname];
                    CalculatePackageDepSize(pkg, p);
                    console.log("    " + pkg.ownSize.totalSize + " / " + pkg.depSize.totalSize + " (" + pkg.ownSize.totalFiles + " / " + pkg.depSize.totalFiles+ ")");
                }
                let Q2 = async.queue((task, callback) => {
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
                        pkg.versions[v].ownSize = p[pkg.name].ownSize;
                        pkg.versions[v].depSize = p[pkg.name].depSize;
                        pkg.versions[v].recursiveDeps = p[pkg.name].recursiveDeps;
                        fs.writeFile(task, JSON.stringify(pkg), (err) => {
                            return callback(err);
                        });
                    })
                }, 8);
                let done2 = false;
                Q2.drain = () => {
                    if (done2) {
                        callback(null);
                    }
                };
                utils.EnqueueAllFiles(Q2, settings.npm_packages_dir, (x) => x, (err, stats) => {
                    console.log(stats);
                    done = true;
                });
            }
        };
        utils.EnqueueAllFiles(Q, settings.npm_packages_dir, (x) => x, (err, stats) => {
            console.log(stats);
            done = true;
        });
    },



    

};
