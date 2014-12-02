'use strict';

var spotifyServices = angular.module('spotifyServices', ['oauth']);

spotifyServices.factory('SpotifyLibrary', ["$q", "$http", function ($q, $http) {
	var cache = {
		info: null
	};

	return {
		getInfo: getInfo,
		getTracks: getTracks
	};

	function getInfo(force) {
		var deferred = $q.defer();

		function _getInfo() {
			var promise = $http.get('https://api.spotify.com/v1/me/tracks', {
				params: {limit: 1}
			});

			promise.then(
					function (result) {
						cache.info = {
							id: 'library',
							name: 'Your music',
							type: 'library',
							total: result.data.total
						};

						deferred.resolve(cache.info);
					},
					function (error) {
						deferred.reject(error);
					});
		}

		if (cache.info && !force) {
			deferred.resolve(cache.info);
		} else {
			_getInfo();
		}

		return deferred.promise;
	}

	function getTracks(positions) {
		var deferred = $q.defer();
		var library_tracks = [];
		var url = 'https://api.spotify.com/v1/me/tracks';

		function _getSomeTracks(requests) {
			if (requests.length <= 0) {
				deferred.resolve(library_tracks);
				return;
			}

			var current_request = requests.shift();
			$http.get(url, {params: {offset: current_request.offset, limit: current_request.limit}
			}).then(
					function (result) {
						var handled = 0;

						for (var i = 0; i < result.data.items.length; ++i) {
							// We are only interested in some of the tracks in the playlist, not all.
							// Skip those we are not interested in.
							if (!(i in current_request.items)) {
								continue;
							}

							var playlist_track = result.data.items[i];
							library_tracks.push(playlist_track.track.uri);
							++handled;
						}

						deferred.notify({
							delta: handled,
							current: library_tracks.length,
							total: positions.length
						});

						_getSomeTracks(requests);
					},
					function (error) {
						deferred.reject(error);
					});
		}

		function _getAllTracks() {
			$http.get(url).then(
					function (result) {
						result.data.items.forEach(function (playlist_track) {
							library_tracks.push(playlist_track.track.uri);
						});

						deferred.notify({
							delta: result.data.items.length,
							current: library_tracks.length,
							total: result.total
						});

						if (result.next) {
							url = result.next;
							_getAllTracks();
						} else {
							deferred.resolve(library_tracks);
						}
					},
					function (error) {
						deferred.reject(error);
					});
		}

		if (positions) {
			var requests = [];
			var current_request = null;
			var MAX_TRACKS_PER_REQUEST = 50;

			positions.forEach(function (position) {
				// If a request is currently being defined
				if (current_request) {
					// If adding this position would violate the API limits, save existing
					// request and later on create a new one.
					if (position - current_request.offset + 1 > MAX_TRACKS_PER_REQUEST) {
						requests.push(current_request);
						current_request = null;
					}
					// Else, if we can add this position to the request and respect API limits,
					// do so...
					else {
						current_request.limit = position - current_request.offset + 1;
						current_request.items.push(position - current_request.offset);
					}
				}

				// If no request currently being defined, create new
				if (!current_request) {
					current_request  = {
						offset: position,
						limit: 1,
						items: [0]
					}
				}
			});

			// If we have a current_request left over, add it to the request list
			if (current_request) {
				requests.push(current_request);
			}

			_getSomeTracks(requests);
		} else {
			_getAllTracks();
		}

		return deferred.promise;
	}
}]);

spotifyServices.factory('SpotifyPlaylist', ["$q", "$http", "Profile", function ($q, $http, Profile) {
	var cache = {
		playlists_info: []
	};

	return {
		getPlaylistsInfo: getPlaylistsInfo,
		getPlaylistTracks: getPlaylistTracks,
		setPlaylistTracks: setPlaylistTracks,
		addPlaylist: addPlaylist
	};

	function parsePlaylist(playlistData) {
		return {
			id: playlistData.id,
			name: playlistData.name,
			type: 'playlist',
			total: playlistData.tracks.total,
			owner: playlistData.owner.id
		};
	}

	function getPlaylistsInfo(force) {
		var deferred = $q.defer();
		var url = 'https://api.spotify.com/v1/users/' + Profile.get().id + '/playlists?limit=50';

		function _getPlaylistsInfo() {
			$http.get(url).then(
					function (result) {
						result.data.items.forEach(function (playlist) {
							var parsed_playlist = parsePlaylist(playlist);
							cache.playlists_info.push(parsed_playlist);
						});

						if (result.next) {
							url = result.next;
							_getPlaylistsInfo();
						} else {
							sortPlaylists();
							deferred.resolve(cache.playlists_info);
						}
					},
					function (error) {
						deferred.reject(error);
					});
		}


		if (cache.playlists_info.length > 0 && !force) {
			deferred.resolve(cache.playlists_info);
		} else {
			cache.playlists_info = [];
			_getPlaylistsInfo();
		}

		return deferred.promise;
	}

	function getPlaylistTracks(playlist, positions) {
		var deferred = $q.defer();
		var playlist_tracks = [];
		var fields = "items.track.uri";
		var url = 'https://api.spotify.com/v1/users/' + playlist.owner + '/playlists/' + playlist.id + '/tracks';

		function _getSomePlaylistTracks(requests) {
			if (requests.length <= 0) {
				deferred.resolve(playlist_tracks);
				return;
			}

			var current_request = requests.shift();
			//$http.get(url, {params: {fields: fields, offset: current_request.offset, limit: current_request.limit}
			// TODO: Temporarily removed fields parameter due to Spotify Web API bug.
			$http.get(url, {params: {offset: current_request.offset, limit: current_request.limit}
			}).then(
					function (result) {
						var handled = 0;

						for (var i = 0; i < result.data.items.length; ++i) {
							// We are only interested in some of the tracks in the playlist, not all.
							// Skip those we are not interested in.
							if (!(i in current_request.items)) {
								console.log("Skipping " + i);
								continue;
							}

							var playlist_track = result.data.items[i];

							// TODO: Spotify Web API bug
							if (playlist_track.track == null) {
								continue;
							}

							playlist_tracks.push(playlist_track.track.uri);
							++handled;
						}

						deferred.notify({
							delta: handled,
							current: playlist_tracks.length,
							total: positions.length
						});

						_getSomePlaylistTracks(requests);
					},
					function (error) {
						deferred.reject(error);
					});
		}

		function _getAllPlaylistTracks() {
			//$http.get(url, {params: {fields: fields}}).then(
			// TODO: Temporarily removed fields parameter due to Spotify Web API bug
			$http.get(url).then(
					function (result) {
						result.data.items.forEach(function (playlist_track) {
							playlist_tracks.push(playlist_track.track.uri);
						});
						deferred.notify({
							delta: result.data.items.length,
							current: playlist_tracks.length,
							total: result.total
						});

						if (result.next) {
							url = result.next;
							_getAllPlaylistTracks();
						} else {
							deferred.resolve(playlist_tracks);
						}
					},
					function (error) {
						deferred.reject(error);
					});
		}

		if (positions) {
			var requests = [];
			var current_request = null;
			var MAX_TRACKS_PER_REQUEST = 100;

			positions.forEach(function (position) {
				// If a request is currently being defined
				if (current_request) {
					// If adding this position would violate the API limits, save existing
					// request and later on create a new one.
					if (position - current_request.offset + 1 > MAX_TRACKS_PER_REQUEST) {
						requests.push(current_request);
						current_request = null;
					}
					// Else, if we can add this position to the request and respect API limits,
					// do so...
					else {
						current_request.limit = position - current_request.offset + 1;
						current_request.items.push(position - current_request.offset);
					}
				}

				// If no request currently being defined, create new
				if (!current_request) {
					current_request  = {
						offset: position,
						limit: 1,
						items: [0]
					}
				}
			});

			// If we have a current_request left over, add it to the request list
			if (current_request) {
				requests.push(current_request);
			}

			_getSomePlaylistTracks(requests);
		} else {
			_getAllPlaylistTracks();
		}

		return deferred.promise;
	}

	function clearPlaylist(playlist_id) {
		var promise = $http.put(
				'https://api.spotify.com/v1/users/' + Profile.get().id + '/playlists/' + playlist_id + '/tracks',
				{uris: []}
		);

		return promise.then(function () {
			for (var i = 0; i < cache.playlists_info.length; ++i) {
				var playlist_info = cache.playlists_info[i];

				if (playlist_info.id == playlist_id) {
					playlist_info.total = 0;
					break;
				}
			}
		});
	}

	function addPlaylistTracks(playlist_id, track_uris) {
		var MAX_TRACKS_PER_REQUEST = 100;

		var deferred = $q.defer();
		var num_tracks_added = 0;
		var url = 'https://api.spotify.com/v1/users/' + Profile.get().id + '/playlists/' + playlist_id + '/tracks';

		function _addPlaylistTracks(track_uris) {
			if (track_uris.length <= 0) {
				deferred.resolve(num_tracks_added);
				return;
			}

			var current_batch = track_uris.splice(0, MAX_TRACKS_PER_REQUEST);
			$http.post(url, {uris: current_batch}).then(
					function (result) {
						num_tracks_added += current_batch.length;
						deferred.notify({
							delta: current_batch.length,
							current: num_tracks_added,
							total: track_uris.length
						});
						_addPlaylistTracks(track_uris);
					},
					function (error) {
						deferred.reject(error);
					});
		}

		_addPlaylistTracks(track_uris);

		return deferred.promise.then(function () {
			for (var i = 0; i < cache.playlists_info.length; ++i) {
				var playlist_info = cache.playlists_info[i];

				if (playlist_info.id == playlist_id) {
					playlist_info.total = num_tracks_added;
					break;
				}
			}
		});
	}

	function setPlaylistTracks(playlist_id, track_uris) {
		return clearPlaylist(playlist_id).then(function () {
			return addPlaylistTracks(playlist_id, track_uris);
		});
	}

	function addPlaylist(name) {
		var promise = $http.post('https://api.spotify.com/v1/users/' + Profile.get().id + '/playlists', {
			name: name,
			public: false
		});

		return promise.then(function (result) {
			var playlist = parsePlaylist(result.data);
			cache.playlists_info.push(playlist);
			sortPlaylists();
			return playlist;
		});
	}

	function sort_by(field, reverse, primer) {
		var key = function (x) {
			return primer ? primer(x[field]) : x[field]
		};
		return function (a, b) {
			var A = key(a), B = key(b);
			return (
					(A < B) ? -1 : (
							(A > B) ? 1 : (
									(typeof then === 'function') ? then(a, b) : 0
							)
					)
			) * [1, -1][+!!reverse];
		};
	}

	function sortPlaylists() {
		cache.playlists_info.sort(sort_by('name'));
	}
}]);

spotifyServices.factory('SpotifySources', ["$q", "SpotifyLibrary", "SpotifyPlaylist", function ($q, SpotifyLibrary, SpotifyPlaylist) {
	return {
		get: getSources,
		getSourceTracks: getSourceTracks
	};

	function getSources() {
		return $q.all([SpotifyLibrary.getInfo(true), SpotifyPlaylist.getPlaylistsInfo(true)]).then(function (result) {
			return {
				library: result[0],
				playlists: result[1],
				merged: [result[0]].concat(result[1])
			}
		});
	}

	function getSourceTracks(source, track_positions) {
		if (source.type == 'library') {
			return SpotifyLibrary.getTracks(track_positions);
		} else {
			return SpotifyPlaylist.getPlaylistTracks(source, track_positions);
		}
	}
}]);
