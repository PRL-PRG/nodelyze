const fs = require("fs");
const async = require("async");
const mkdirp = require("mkdirp");

module.exports = {

    ToHMS : function(t) {
        let seconds = Math.floor(t % 60);
        t = Math.floor(t / 60);
        let minutes = Math.floor(t % 60);
        let hours = Math.floor(t / 60);
        return hours + ":" + minutes + ":" + seconds; 
    },


    
    IsFileSync : function(path) {
        
    },

    IsFolderSync : function(path) {
        return fs.lstatSync(path).isDirectory();
    },

    /** Saves file with given filename and path, creating the path if it does not exist yet.
     */
    SaveFile : function(path, filename, contents, callback) {
        mkdirp(path, (err) => {
            if (err)
                return callback(err);
            fs.writeFile(path + "/" + filename, contents, (err) => {
                return callback(err);
            });
        });
    },

    /** Mangles given string so that it can be used as a file or directory name.

        This means that any character that is not a letter or a number is converted into an underscore followed by the hexadecimal representation of its ASCII code.
     */
    Mangle : function(what) {
        let result = ""
        for (let i = 0; i < name.length; ++i) {
            let c = name.charAt(i);
            if ((c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
                result = result + c;
            } else {
                let code = c.charCodeAt(0)
                result = result + '_' + code.toString(16);
            }
        }
        return result;
    },

    /** Demangles the given string back to its original value, i.e. replaces underscores followed by the hex ASCII code with the ASCII code itself.
     */
    Demangle : function(what) {
        let result = "";
        let i = 0;
        while (i < name.length) {
            let c = name.charAt(i);
            if (c === '_') {
                ++i;
                let code = parseInt(name.charAt(i) + name.charAt(i + 1), 16)
                result += String.fromCharCode(code);
                ++i;
            } else {
                result = result + c;
            }
            ++i;
        }
        return result;    
    },

    /** Enqueues all files found under the given root folder recursively into the provided queue. The validator function is executed for each file and rthe file taking the full file path as an argument and returns the object that should be enqueued, or undefined if the file should be skipped. When done, the callback function is called with the number of files found and number of files enqueued as arguments.  
     */
    EnqueueAllFiles : function(q, root, validator, callback) {
        let total = 0;
        let skipped = 0;
        let errors = [];
        fs.readdir(root, (err, files) => {
            // propagate the error
            if (err)
                return callback(err);
            // iterate over the files, recurse into directories, add files
            let expected = 1;
            let nextCallback = function(err, result) {
                if (err) {
                    console.log(err);
                    errors.push(err);
                } else {
                    total += result.total;
                    skipped += result.skipped;
                }
                if (--expected == 0)
                    callback(errors.length === 0 ? null : errors, { total : total, skipped : skipped });
            };
            files.forEach((file) => {
                let filename = root + "/" + file;
                if (module.exports.IsFolderSync(filename)) {
                    ++expected;
                    module.exports.EnqueueAllFiles(q, filename, validator, nextCallback);
                    // it is a file
                } else {
                    ++total;
                    let x = validator(filename);
                    if (x !== undefined)
                        q.push(x);
                    else
                        ++skipped;
                }
            });
            nextCallback(null, { total : 0, skipped : 0 });
        });
    },
    
    /** Enquueues all lines in the specified CSV file. The validator function takes each line of the CSV file (parsed as array of string values) and constructs the task for the queue, or returns undefined if the line should be skipped. The callback is called when done with the number of lins read and lines enqueued.
     */
    EnqueueCSV : function(q, filename, validator, callback)  {
        
    },


    
    
    
};
