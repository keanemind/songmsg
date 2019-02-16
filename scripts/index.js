const base_uri = (
    window.location.protocol + '//' +
    window.location.hostname +
    window.location.pathname
); // needs testing with browsers other than Chrome
// window.location.pathname includes leading slash?
// window.location.hostname trailing slash?

if (window.location.hash) {
    const hash = window.location.hash.substr(1);
    let result = {};
    hash.split("&").forEach(function(part) {
        var item = part.split("=");
        result[item[0]] = decodeURIComponent(item[1]);
    });

    if (result['state'] && result['access_token']) {
        // Spotify just redirected here
        performAPIRequests(result['state'].split(' '), result['access_token']);
    } else if (result['link']) {
        // performAPIRequsts() just redirected here
        displayResult(result['link']);
    }
}

function displayResult(link) {
    alert("Here's your link: " + link)
}

function performAPIRequests(words, accessToken) {
    let count = 0;
    let tracks = {};

    let promise = new Promise(function(resolve, reject) {
        for (let i = 0; i < words.length; i++) {
            const request = new XMLHttpRequest();
            request.onload = function() {
                count++;
                // Process the server response here.
                const resp = JSON.parse(request.responseText);
                for (let j = 0; j < resp['tracks']['items'].length; j++) {
                    if (resp['tracks']['items'][j]['name'].toLowerCase() === words[i].toLowerCase()) {
                        tracks[words[i]] = resp['tracks']['items'][j]['uri'];
                        break;
                    }
                }
                if (count === words.length) {
                    resolve();
                }
            };

            let txt = encodeURIComponent(words[i]);
            request.open('GET', 'https://api.spotify.com/v1/search?q=' + txt + '&type=track', true);
            request.setRequestHeader('Authorization', 'Bearer ' + accessToken);
            request.send()
        }
    })
    promise.then(function(){
        makePlaylist(accessToken, words, tracks);
    });
}

function makePlaylist(accessToken, words, tracks) {
    let track_uris_encoded = []; // song URIs in order of words in text
    for (let i = 0; i < words.length; i++) {
        if (tracks[words[i]]) {
            track_uris_encoded.push(encodeURIComponent(tracks[words[i]]));
        }
    }
    const track_uris_str = track_uris_encoded.join(',');

    // Get user id
    let id;
    const requestGetId = new XMLHttpRequest();
    requestGetId.onload = function() {
        const resp = JSON.parse(requestGetId.responseText);
        id = resp['id'];
    }
    requestGetId.open('GET', 'https://api.spotify.com/v1/me', false);
    requestGetId.setRequestHeader('Authorization', 'Bearer ' + accessToken);
    requestGetId.send();

    // Create playlist
    let tracksEndpoint;
    let newPlaylistURL;
    const requestMakePlaylist = new XMLHttpRequest();
    requestMakePlaylist.onload = function() {
        const resp = JSON.parse(requestMakePlaylist.responseText);
        tracksEndpoint = resp['tracks']['href'];
        newPlaylistURL = resp['external_urls']['spotify'];
    }
    requestMakePlaylist.open('POST', 'https://api.spotify.com/v1/users/' + id + '/playlists', false);
    requestMakePlaylist.setRequestHeader('Authorization', 'Bearer ' + accessToken);
    requestMakePlaylist.setRequestHeader('Content-Type', 'application/json');
    requestMakePlaylist.send('{"name": "Diss Playlist"}');

    // Add tracks
    const requestAddTracks = new XMLHttpRequest();
    requestAddTracks.onload = function() {
        // Check if adding tracks was successful
        // If failed, delete playlist
        // If succeeded, redirect
        window.location.replace(
            base_uri + '#link=' + encodeURIComponent(newPlaylistURL));
    }
    requestAddTracks.open('POST', tracksEndpoint + '?uris=' + track_uris_str, false);
    requestAddTracks.setRequestHeader('Authorization', 'Bearer ' + accessToken);
    requestAddTracks.send();
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
