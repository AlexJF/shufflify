'use strict';

var shufflifyApp = angular.module('shufflifyApp');

shufflifyApp.controller('MainCtrl', ["$scope", "$http", "$location", "SpotifySources", "SpotifyLibrary", "SpotifyPlaylist", "AccessToken", "$modal", "$q", function ($scope, $http, $location, SpotifySources, SpotifyLibrary, SpotifyPlaylist, AccessToken, $modal, $q) {
	$scope.host = $location.host();
	$scope.localhost = $scope.host == '127.0.0.1' || $scope.host == 'localhost';

	$scope.spotifyData = {
		sources: [],
		library: [],
		playlists: []
	};

	$scope.selectionData = {
		sources: [],
		totalSongsInSources: 0,
		destination: null,
		totalSongsInDestination: 0,
		maxSongsDestination: null,
		ensureUnique: false
	};

	$scope.newPlaylistName = "";
	$scope.profile = null;
	$scope.spotifyDataStartedLoading = false;

	$scope.$on('oauth:logout', forgetProfile);
	$scope.$on('oauth:expired', forgetProfile);
	$scope.$on('oauth:denied', forgetProfile);
	$scope.$on('oauth:profile', loadProfile);

	function loadProfile(event, profile) {
		$http.defaults.headers.common.Authorization = 'Bearer ' + AccessToken.get().access_token;
		$scope.profile = profile;
		$scope.loadSpotifyData();
	}

	function forgetProfile() {
		$scope.profile = null;
		$scope.spotifyDataStartedLoading = false;
		$http.defaults.headers.common.Authorization = null;
		AccessToken.destroy();
	}

	$scope.loadSpotifyData = function () {
		if ($scope.spotifyDataStartedLoading) {
			return;
		}
		$scope.spotifyDataStartedLoading = true;
		SpotifySources.get().then(function (sources) {
			$scope.spotifyData.sources = sources.merged;
			$scope.spotifyData.library = sources.library;
			$scope.spotifyData.playlists = sources.playlists;
		});
	};

	$scope.$watchCollection('selectionData.sources', function () {
		var total = 0;

		$scope.selectionData.sources.forEach(function (source) {
			total += source.total;
		});

		$scope.selectionData.totalSongsInSources = total;
	});

	$scope.$watchCollection("[selectionData.totalSongsInSources, selectionData.maxSongsDestination]", function () {
		var maxSongsDestination = $scope.selectionData.maxSongsDestination;
		var totalSongsInSources = $scope.selectionData.totalSongsInSources;

		if ((!maxSongsDestination && maxSongsDestination !== 0) || maxSongsDestination < 0) {
			$scope.selectionData.totalSongsInDestination = totalSongsInSources;
		} else {
			$scope.selectionData.totalSongsInDestination = Math.min(maxSongsDestination, totalSongsInSources);
		}
	});

	$scope.selectAllSources = function () {
		$scope.selectionData.sources = angular.extend($scope.spotifyData.sources);
	};

	$scope.clearSourcesSelection = function () {
		$scope.selectionData.sources = undefined;
	};

	var addPlaylistDialogCtrl = ["$scope", "$modalInstance", "selectionData", function ($scope, $modalInstance, selectionData) {
		$scope.selectionData = selectionData;
		$scope.playlistInfo = {
			name: null
		};

		$scope.ok = function () {
			SpotifyPlaylist.addPlaylist($scope.playlistInfo.name).then(function (playlist) {
				$modalInstance.close(playlist);
			});
		};

		$scope.cancel = function () {
			$modalInstance.dismiss('cancel');
		};
	}];

	$scope.addPlaylist = function (name) {
		var addPlaylistDialog = $modal.open({
			templateUrl: "views/add_playlist.html",
			controller: addPlaylistDialogCtrl,
			windowClass: "add-playlist-dialog",
			resolve: {
				selectionData: function () {
					return $scope.selectionData;
				}
			}
		});

		addPlaylistDialog.result.then(function (playlist) {
			$scope.selectionData.destination = playlist;
		});
	};

	var confirmDialogCtrl = ["$scope", "$modalInstance", "selectionData", function ($scope, $modalInstance, selectionData) {
		$scope.selectionData = selectionData;

		$scope.ok = function () {
			$modalInstance.close();
		};

		$scope.cancel = function () {
			$modalInstance.dismiss('cancel');
		};
	}];

	var progressDialogCtrl = ["$scope", "$modalInstance", "selectionData", function ($scope, $modalInstance, selectionData) {
		$scope.selectionData = selectionData;

		$scope.progressData = {
			total_songs_to_read: $scope.selectionData.ensureUnique ? $scope.selectionData.totalSongsInSources : $scope.selectionData.totalSongsInDestination,
			total_songs_to_write: $scope.selectionData.totalSongsInDestination,
			num_tracks_read: 0,
			num_tracks_written: 0,
			percent_tracks_read: 0,
			percent_tracks_written: 0,
			finished_read: false,
			finished_write: false,
			write_error: null,
			read_error: null
		};

		$scope.$watchCollection("[progressData.num_tracks_read, progressData.total_songs_to_read]", function () {
			$scope.progressData.percent_tracks_read =
					$scope.progressData.num_tracks_read / $scope.progressData.total_songs_to_read * 100;
		});

		$scope.$watchCollection("[progressData.num_tracks_written, progressData.total_songs_to_write]", function () {
			$scope.progressData.percent_tracks_written =
					$scope.progressData.num_tracks_written / $scope.progressData.total_songs_to_write * 100;
		});

		$scope.$on("progress:tracks_read", function (event, delta) {
			$scope.progressData.num_tracks_read += delta;
		});

		$scope.$on("progress:finished_read", function () {
			$scope.progressData.finished_read = true;
		});

		$scope.$on("progress:tracks_written", function (event, delta) {
			$scope.progressData.num_tracks_written += delta;
		});

		$scope.$on("progress:finished_write", function () {
			$scope.progressData.finished_write = true;
		});

		$scope.$on("progress:read_error", function (event, error) {
			$scope.progressData.read_error = error;
		});

		$scope.$on("progress:write_error", function (event, error) {
			$scope.progressData.write_error = error;
		});

		// The total songs to write can be updated by duplicate removal.
		$scope.$on("progress:new_total_write_count", function (event, total_songs_to_write) {
			console.log("Old total write count: " + $scope.progressData.total_songs_to_write);
			console.log("New total write count: " + total_songs_to_write);
			$scope.progressData.total_songs_to_write = total_songs_to_write;
		});

		$scope.ok = function () {
			$modalInstance.close();
		};
	}];

	function getSomeTracksFromSources() {
		var songs = [];
		var songNum = 0;

		$scope.selectionData.sources.forEach(function (source) {
			for (var i = 0; i < source.total; ++i) {
				songs.push(songNum++);
			}
		});

		var chosen_songs = window.chance.pick(songs, $scope.selectionData.totalSongsInDestination);
		// Sort by integers
		chosen_songs.sort(function (a, b) { return a - b; });

		var total_chosen_songs = chosen_songs.length;
		var current_offset = 0;
		var i = 0;

		var promises = [];

		$scope.selectionData.sources.forEach(function (source) {
			var source_total = source.total;
			var source_songs = [];

			while (i < total_chosen_songs) {
				var current_song_pos_in_source = chosen_songs[i] - current_offset;

				// If the song we're currently looking at belongs to a different source, move on
				if (current_song_pos_in_source >= source_total) {
					break;
				}
				// Else, add it to the source_songs collection
				else {
					source_songs.push(current_song_pos_in_source);
					++i;
				}
			}

			current_offset += source_total;

			promises.push(SpotifySources.getSourceTracks(source, source_songs).then(
					null,
					null,
					function (progress) {
						$scope.$broadcast("progress:tracks_read", progress.delta);
					}));
		});

		return promises;
	}

	function getAllTracksFromSources() {
		var promises = [];

		$scope.selectionData.sources.forEach(function (source) {
			promises.push(SpotifySources.getSourceTracks(source).then(
					null,
					null,
					function (progress) {
						$scope.$broadcast("progress:tracks_read", progress.delta);
					}));
		});

		return promises;
	}

	$scope.showConfirmDialog = function() {
		var confirmDialog = $modal.open({
			templateUrl: "views/confirm.html",
			controller: confirmDialogCtrl,
			windowClass: "confirm-dialog",
			resolve: {
				selectionData: function () {
					return $scope.selectionData;
				}
			}
		});

		confirmDialog.result.then(function () {
			var progressDialog = $modal.open({
				templateUrl: "views/progress.html",
				controller: progressDialogCtrl,
				windowClass: "progress-dialog",
				backdrop: "static",
				keyboard: false,
				scope: $scope,
				resolve: {
					selectionData: function () {
						return $scope.selectionData;
					}
				}
			});

			var destination_contains_all =
					$scope.selectionData.totalSongsInSources == $scope.selectionData.totalSongsInDestination;
			var ensure_unique = $scope.selectionData.ensureUnique;
			var promises = null;
			if (destination_contains_all || ensure_unique) {
				promises = getAllTracksFromSources();
			} else {
				promises = getSomeTracksFromSources();
			}

			$q.all(promises).then(
					// Success
					function (result) {
						$scope.$broadcast("progress:finished_read");

						var track_uris = [];

						result.forEach(function (tracks) {
							track_uris = track_uris.concat(tracks);
						});

						// Filter strange results out
						track_uris = track_uris.filter(function (track) {
							return track != "spotify:track:null";
						});

						if (ensure_unique) {
							// Remove duplicates by sorting and deleting those elements
							// that are preceded by an element with the same value.
							// From: http://stackoverflow.com/a/9229821/441265
							track_uris = track_uris.sort().filter(function(item, pos) {
								return !pos || item != track_uris[pos - 1];
							});

							$scope.$broadcast("progress:new_total_write_count", track_uris.length);
						}

						// (Re)shuffle to introduce randomness
						if (track_uris.length > $scope.selectionData.totalSongsInDestination) {
							track_uris = window.chance.pick(track_uris, $scope.selectionData.totalSongsInDestination);
							$scope.$broadcast("progress:new_total_write_count", track_uris.length);
						} else {
							track_uris = window.chance.shuffle(track_uris);
						}

						SpotifyPlaylist.setPlaylistTracks($scope.selectionData.destination.id, track_uris).then(
								// Success
								function (result) {
									$scope.$broadcast("progress:finished_write");
								},
								function (error) {
									console.log("Write error: " + error);
									$scope.$broadcast("progress:write_error", error);
								},
								function (progress) {
									$scope.$broadcast("progress:tracks_written", progress.delta);
								}
						);

						console.log("Success");
					},
					// Error
					function (error) {
						console.log("Read error: " + error);
						$scope.$broadcast("progress:read_error", error);
					},
					function (progress) {
						// Apparently never called??
					}
			);
		});
	};
}]);
