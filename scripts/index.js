const base_uri = (
    window.location.protocol + '//' +
    window.location.hostname +
    window.location.pathname
); // needs testing with browsers other than Chrome
// window.location.pathname includes leading slash?
// window.location.hostname trailing slash?

function isSuccess(statusCode) {
    return Math.floor(statusCode / 100) === 2;
}

if (window.location.hash) {
    const hash = window.location.hash.substr(1);
    let result = {};
    hash.split("&").forEach(function(part) {
        var item = part.split("=");
        result[item[0]] = decodeURIComponent(item[1]);
    });

    if (result['state'] && result['access_token']) {
        // Spotify just redirected here
        performAPIRequests(result['access_token'], result['state'].split(' '));
    } else if (result['link']) {
        // performAPIRequsts() just redirected here
        displayResult(result['link']);
    }
}

function displayResult(link) {
    alert("Here's your link: " + link)
}

function performAPIRequests(accessToken, words) {
    searchSongs(accessToken, words).then(function(tracks) {
        makePlaylist(accessToken).then(function(res) {
            tracksEndpoint = res[0];
            playlistURL = res[1];
            addTracks(
                accessToken, words, tracks, tracksEndpoint
            ).then(function() {
                // Redirect
                window.location.replace(
                    base_uri + '#link=' + encodeURIComponent(playlistURL)
                );
            }, function(error) {
                // A song could not be added to the playlist
                console.error(error);

                // Delete new playlist
            });
        }, function(error) {
            // A new playlist could not be created
            console.error(error);
        });
    }, function(error) {
        // A song could not be found
        console.error(error);
    });
}

function searchSongs(accessToken, words) {
    const tracks = {};
    const requestPromises = [];
    for (let i = 0; i < words.length; i++) {
        requestPromises.push(new Promise(function(resolve, reject) {
            const request = new XMLHttpRequest();
            request.onload = function() {
                if (isSuccess(request.status)) {
                    // Search for song in the response that matches word
                    const resp = JSON.parse(request.responseText);
                    const items = resp['tracks']['items'];
                    for (let j = 0; j < items.length; j++) {
                        if (
                            items[j]['name'].toLowerCase() ===
                            words[i].toLowerCase()
                        ) {
                            tracks[words[i]] = items[j]['uri'];
                            resolve();
                            return;
                        }
                    }
                    reject(Error('Song not found.'));
                } else {
                    reject(Error(request.statusText));
                }
            };
            request.onerror = function() {
                reject(Error('Network Error'));
            };
            const txt = encodeURIComponent(words[i]);
            request.open(
                'GET',
                'https://api.spotify.com/v1/search?q=' + txt + '&type=track'
            );
            request.setRequestHeader('Authorization', 'Bearer ' + accessToken);
            request.send();
        }));
    }

    return new Promise(function(resolve, reject) {
        Promise.all(requestPromises).then(function() {
            resolve(tracks);
        }, function(error) {
            reject(error);
        });
    });
}

function makePlaylist(accessToken) {
    return new Promise(function(resolve, reject) {
        getUserId(accessToken).then(function(id) {
            // Create playlist
            const request = new XMLHttpRequest();
            request.onload = function() {
                if (isSuccess(request.status)) {
                    const resp = JSON.parse(request.responseText);
                    const tracksEndpoint = resp['tracks']['href'];
                    const newPlaylistURL = resp['external_urls']['spotify'];
                    resolve([tracksEndpoint, newPlaylistURL]);
                } else {
                    console.log('status: ' + request.status);
                    reject(Error(request.statusText));
                }
            }
            request.onerror = function() {
                reject(Error('Network Error'));
            };
            request.open(
                'POST',
                'https://api.spotify.com/v1/users/' + id + '/playlists'
            );
            request.setRequestHeader('Authorization', 'Bearer ' + accessToken);
            request.setRequestHeader('Content-Type', 'application/json');
            request.send('{"name": "Diss Playlist"}');
        }, function(error) {
            reject(error);
        });
    });
}

function addTracks(accessToken, words, tracks, tracksEndpoint) {
    return new Promise(function(resolve, reject) {
        let track_uris_encoded = []; // song URIs in order of words in text
        for (let i = 0; i < words.length; i++) {
            if (tracks[words[i]]) {
                track_uris_encoded.push(encodeURIComponent(tracks[words[i]]));
            }
        }
        const track_uris_str = track_uris_encoded.join(',');
    
        const request = new XMLHttpRequest();
        request.onload = function() {
            // Check if adding tracks was successful
            // If failed, delete playlist
            // If succeeded, redirect
            if (isSuccess(request.status)) {
                resolve();
            } else {
                reject(Error(request.statusText));
            }
        }
        request.onerror = function() {
            reject(Error('Network Error'));
        }
        request.open('POST', tracksEndpoint + '?uris=' + track_uris_str);
        request.setRequestHeader('Authorization', 'Bearer ' + accessToken);
        request.send();
    });
}

function getUserId(accessToken) {
    return new Promise(function(resolve, reject) {
        const request = new XMLHttpRequest();
        request.onload = function() {
            if (isSuccess(request.status)) {
                const resp = JSON.parse(request.responseText);
                resolve(resp['id']);
            } else {
                reject(Error(request.statusText));
            }
        }
        request.onerror = function() {
            reject(Error('Network Error'));
        };
        request.open('GET', 'https://api.spotify.com/v1/me');
        request.setRequestHeader('Authorization', 'Bearer ' + accessToken);
        request.send();
    });
}

function redirect() {
    if (document.getElementById('text-field').value == '') {
        // No input
        return false;
    }
    const client_id = '874f7bfba973402f89d7984cfaa8106c';
    const redirect_uri = encodeURIComponent(base_uri);
    const scope = encodeURIComponent('playlist-modify-public playlist-modify-private');
    const response_type = 'token';
    const state = encodeURIComponent(document.getElementById('text-field').value);
    window.location.href = (
        'https://accounts.spotify.com/authorize?' +
        'client_id=' + client_id +
        '&redirect_uri=' + redirect_uri +
        '&scope=' + scope +
        '&response_type=' + response_type +
        '&state=' + state
    );
    return false;
}
