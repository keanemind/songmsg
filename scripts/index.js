document.getElementById('spotify-button').addEventListener('click', spotifyButtonClickHandler);
document.getElementById('input-form').addEventListener('submit', formSubmitHandler);
document.getElementById('text-field').addEventListener('input', textFieldEditHandler);
document.getElementById('text-field').addEventListener('click', textFieldClickHandler);
document.addEventListener('click', documentClickHandler);

const base_uri = (
    window.location.protocol + '//' +
    window.location.hostname +
    window.location.pathname
); // needs testing with browsers other than Chrome
// window.location.pathname includes leading slash?
// window.location.hostname trailing slash?

let url_params = undefined;

if (window.location.hash) {
    const hash = window.location.hash.substr(1);
    let result = {};
    hash.split("&").forEach(function(part) {
        var item = part.split("=");
        result[item[0]] = decodeURIComponent(item[1]);
    });

    if (result['access_token']) {
        // Spotify just redirected here
        url_params = result;
        displayInputView();
    }
}

/* Event Handlers */

function spotifyButtonClickHandler(event) {
    event.preventDefault();
    redirect();
}

function formSubmitHandler(event) {
    event.preventDefault();
    performAPIRequests();
}

function textFieldEditHandler(event) {
    if (!event) {
        event = window.event;
    }
    console.log(event.inputType);
    console.log(document.getElementById('text-field').value);
}

function textFieldClickHandler(event) {
    event.stopPropagation();
    console.log('Open autocomplete list if not already open')
}

function documentClickHandler(event) {
    console.log('Close autocomplete list');
}

/* Logic Functions */

function redirect() {
    const client_id = '874f7bfba973402f89d7984cfaa8106c';
    const redirect_uri = encodeURIComponent(base_uri);
    const scope = encodeURIComponent('playlist-modify-public playlist-modify-private');
    const response_type = 'token';
    window.location.href = (
        'https://accounts.spotify.com/authorize?' +
        'client_id=' + client_id +
        '&redirect_uri=' + redirect_uri +
        '&scope=' + scope +
        '&response_type=' + response_type
    );
}

function performAPIRequests() {
    if (document.getElementById('text-field').value == '') {
        // No input
        return false;
    }

    const accessToken = url_params['access_token'];
    const words = document.getElementById('text-field').value.split(' ');

    let trackURIs;
    let tracksEndpoint;
    let playlistURL;
    let playlistID;
    searchSongs(accessToken, words).then(function(tracks) {
        trackURIs = tracks;
        return makePlaylist(accessToken);
    }).then(function(res) {
        tracksEndpoint = res[0];
        playlistURL = res[1];
        playlistID = res[2];
        return addTracks(accessToken, words, trackURIs, tracksEndpoint);
    }).then(function() {
        displayResult(playlistURL);
        document.getElementById('text-field').value = '';
    }, function(error) {
        // Something failed
        console.error(error);

        // Remove new playlist if created
        if (playlistID) {
            unfollowPlaylist(
                accessToken,
                playlistID
            ).then(undefined, function(error) {
                // Failed to unfollow playlist
                console.error(error);
            });
        }
    });
    return false;
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
                    const playlistURL = resp['external_urls']['spotify'];
                    const playlistID = resp['id'];
                    resolve([tracksEndpoint, playlistURL, playlistID]);
                } else {
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
            request.send('{"name": "Song Message"}');
        }, function(error) {
            reject(error);
        });
    });
}

function unfollowPlaylist(accessToken, playlistID) {
    return new Promise(function(resolve, reject) {
        const request = new XMLHttpRequest();
        request.onload = function() {
            if (isSuccess(request.status)) {
                resolve();
            } else {
                reject(Error(request.statusText));
            }
        }
        request.onerror = function() {
            reject(Error('Network Error'));
        };
        request.open(
            'DELETE',
            'https://api.spotify.com/v1/playlists/' + playlistID + '/followers'
        );
        request.setRequestHeader('Authorization', 'Bearer ' + accessToken);
        request.send();
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

function isSuccess(statusCode) {
    return Math.floor(statusCode / 100) === 2;
}

/* UI Functions */

function displayResult(link) {
    alert("Here's your link: " + link);
}

function displayAlert(message) {
    alert(message);
}

function displayInputView() {
    document.getElementById('spotify-button').style.display = 'none';
    document.getElementById('input-form').style.display = 'flex';
}

function displayAuthView() {
    document.getElementById('spotify-button').style.display = null;
    document.getElementById('input-form').style.display = 'none';
}
