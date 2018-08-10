const request = require("request");


var tokens = undefined;
var tokenIndex = 3;
var tokenResetTimes = {};

var requestsCounter = 0;


/** Returns the number of seconds we would have to sleep before the given token will be valid wrt rate limiting.
 */
function SleepForToken(t) {
    if (tokenResetTimes[t] === undefined)
        return 0;
    return tokenResetTimes[t] - (Date.now() / 1000);
}

/** Returns a valid token, or blocks until there is a valid token available.
  */
function GetValidToken() {
    let t = tokens[tokenIndex];
    let sleepFor = SleepForToken(t);
    // if we do not have to sleep for the current token, we are good to go
    if (sleepFor <= 0) {
        tokenResetTimes[t] = undefined;
        return t;
    }
    // otherwise, get the next token and compare which one is better
    let nextIndex = tokenIndex + 1;
    if (nextIndex == tokens.length)
        nextIndex = 0;
    let sleepForNext = SleepForToken(tokens[nextIndex]);
    // if sleep for next token is smaller, 
    if (sleepForNext < sleepFor) {
        tokenIndex = nextIndex;
        console.log("Moving to token " + tokenIndex);
        sleepFor = sleepForNext;
        t = tokens[tokenIndex];
    }
    // if there is no sleep now, return the next token immediately
    if (sleepFor <= 0) {
        tokenResetTimes[t] = undefined;
        return t;
    }
    // otherwise sleep and then retry
    console.log("sleeping for " + sleepFor, "token index: " + tokenIndex + ", sleep for next " + nextIndex);
    setTimeout(GetValidToken, sleepFor * 1000);
}

/** Marks the given token as not valid.
  */
function InvalidateToken(token, resetTime) {
    tokenResetTimes[token] = resetTime;
}

/** Returns the last page, number of pages and number of items per page from given response and result. The information is extracted from the link header and length of the body of the response, which is expected to be an array.
 */
function GetLastPage(response, result) {
    if (response.headers["link"] === undefined)
        return undefined;
    let lastPage = response.headers["link"].split(",")[1].split(";")[0].trim();
    lastPage = lastPage.substr(1, lastPage.length -2);
    let numPages = lastPage.split("page=")[1];
    return { lastPage : lastPage, numPages : numPages, perPage : result.length };
}

/** For a given github api url, returns the number of items it returns, which is calculated by determining number of pages and items per page and the exact number of items on the last page.
 */
function GetCount(url, callback) {
    module.exports.Request(url, (err, result, response) => {
        if (err)
            return callback(err);
        let p = GetLastPage(response, result);
        if (p === undefined) {
            return callback(null, result.length);
        }
        module.exports.Request(p.lastPage, (err, result, response) => {
            if (err)
                return callback(err);
            callback(null, (p.numPages - 1) * p.perPage + result.length);
        })
    });
}

module.exports = {

    /** Initializes the github API module.
     */
    Initialize : function(settings) {
        console.log("Initializing Github API routines...");
        tokens = settings.github_api_tokens;
        console.log("  theoretical max throughput : " + (tokens.length * 5000) + " requests/hour");
    },

    /** Reports the number of requests since last invocation of the function.
     */
    RequestsCounter : function() {
        let result = requestsCounter;
        requestsCounter = 0;
        return result;
    },

    /** Performs the given requests and returns the returned data. If JSON is true, parses the data into an object, otherwise returns the data as a single string. The number of retries can be specified in case github service will be temporarily unavailable. Automatically rotates the tokens and if no free tokens are available sleeps for a time before trying again (this does not count as retries).
     */
    Request : function(url, callback, json = true, retries = 10) {
        let token = GetValidToken();
        if (! url.startsWith("https://api.github.com"))
            url = "https://api.github.com/" + url;
        let options = {
            url : url,
            json : json,
            headers : {
                "Authorization" : "token " + token,
                "User-Agent" : "nodelyze",
                "Accept" : "application/vnd.github.symmetra-preview+json"
            }
        };
        request(options, (err, response, body) => {
            ++requestsCounter;
            // first if there is an error, try retries, if no retries left, 
            if (err || ! body) {
                if (retries > 0) {
                    setTimeout(() => { module.exports.Request(url, callback, json, retries - 1); }, 1000);
                } else {
                    console.log("Request failed all retries:\n" + url);
                    callback(err ? err : "missing body");
                }
                return;
            }
            if (response.status == 202) {
                console.log("Request accepted, sleeping for 10 seconds to get cached results...")
                setTimeout(() => { module.exports.Request(url, callback, json, retries); }, 10000);
                return;
            }
            // now see if we haven't exceeded the rates
            if (body.message && body.message.startsWith("API rate limit exceeded")) {
                InvalidateToken(token, parseInt(response.headers["x-ratelimit-reset"]));
                // recurse, which gives us next free token
                return module.exports.Request(url, callback, json, retries);
            }
            // otherwise all is good, return the result
            return callback(null, body, response);
        });
    },

    /** Returns the number of all issues for the given project.
     */
    GetProjectIssuesCount : function(projectName, callback) {
        GetCount("repos/" + projectName + "/issues?state=all", callback);
    },

    /** Returns the number of commits for the given project.
     */
    GetProjectCommitsCount : function(projectName, callback) {
        GetCount("repos/" + projectName + "/commits", callback);    
    },

    /** Gets project contributors with all their metadata as reported by github.
     */
    GetProjectContributorsCount : function(projectName, callback) {
        //GetCount("repos/" + projectName + "/collaborators", callback);
        GetCount("repos/" + projectName + "/contributors?anon=1", callback);
    },

    /** Returns the composition in bytes for different languages in the project as reported by the Github linguist tool.
     */
    GetProjectLanguages : function(projectName, callback) {
        module.exports.Request("repos/" + projectName + "/languages", (err, result, response) => {
            if (err)
                return callback(err);
            else
                return callback(null, result);
        });
    },

    /** Returns the topics associated with the given project.

        Note that certain versions of the github API provide this information already in the metadata.topics. 
     */
    GetProjectTopics : function(projectName, callback) {
        module.exports.Request("repos/" + projectName + "/topics", (err, result, response) => {
            if (err)
                return callback(err);
            else
                return callback(null, result);
        })
    },
    
}; 
