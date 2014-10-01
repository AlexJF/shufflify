'use strict';

var spotifyServices = angular.module('spotifyServices', [
		'oauth'
]);

spotifyServices.factory('SpotifyLibrary', function ($q, $http) {
	var cache = {
		info: null
	};

	return {
		getInfo: getInfo
	};

	function getInfo(force) {
		var deferred = $q.defer();

		function _getInfo() {
			var promise = $http.get('https://api.spotify.com/v1/me/tracks', {
				params: {limit: 1}
			});

			promise.then(function (result) {
				cache.info = {
					id: 'library',
					name: 'Your music',
					type: 'library',
					total: result.data.total
				};

				deferred.resolve(cache.info);
			});
		}

		if (cache.info && !force) {
			deferred.resolve(cache.info);
		} else {
			_getInfo();
		}

		return deferred.promise;
	}
});

spotifyServices.factory('SpotifyPlaylist', function ($q, $http, Profile) {
	var cache = {
		playlists_info: []
	};

	return {
		getPlaylistsInfo: getPlaylistsInfo,
		addPlaylist: addPlaylist
	};

	function parsePlaylist(playlistData) {
		return {
			id: playlistData.id,
			name: playlistData.name,
			type: 'playlist',
			total: playlistData.tracks.total
		};
	}

	function getPlaylistsInfo(force) {
		var deferred = $q.defer();
		var url = 'https://api.spotify.com/v1/users/' + Profile.get().id + '/playlists?limit=50';

		function _getPlaylistsInfo() {
			$http.get(url).then(function (result) {
				result.data.items.forEach(function (playlist) {
					console.log(JSON.stringify(playlist));
					cache.playlists_info.push(parsePlaylist(playlist));
				});

				if (result.next) {
					url = result.next;
					_getPlaylistsInfo();
				} else {
					sortPlaylists();
					deferred.resolve(cache.playlists_info);
				}
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

	function addPlaylist(name) {
		var promise = $http.post('https://api.spotify.com/v1/users/' + Profile.get().id + '/playlists', {
			name: name,
			public: false
		});
		promise.then(function (result) {
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
});

spotifyServices.factory('SpotifySources', function ($q, SpotifyLibrary, SpotifyPlaylist) {
	return {
		get: getSources
	};

	function getSources() {
		return $q.all([SpotifyLibrary.getInfo(true), SpotifyPlaylist.getPlaylistsInfo(true)]).then(function (result) {
			console.log(JSON.stringify(result));
			return {
				library: result[0],
				playlists: result[1],
				merged: [result[0]].concat(result[1])
			}
		});
	}
});
