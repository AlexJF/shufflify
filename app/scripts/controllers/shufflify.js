'use strict';

var shufflifyApp = angular.module('shufflifyApp');

shufflifyApp.controller('MainCtrl', function ($scope, $http, SpotifySources, SpotifyLibrary,
		SpotifyPlaylist, AccessToken, $modal, $q) {
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
		maxSongsDestination: null
	};

	$scope.newPlaylistName = "";
	$scope.profile = null;
	$scope.spotifyDataStartedLoading = false;

	$scope.$on('oauth:logout', forgetProfile);
	$scope.$on('oauth:expired', forgetProfile);
	$scope.$on('oauth:denied', forgetProfile);
	$scope.$on('oauth:profile', loadProfile);

	function loadProfile(event, profile) {
		console.log('Profile ' + profile);
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
			console.log(JSON.stringify(sources));
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

		console.log("Max songs destination: " + maxSongsDestination);
		console.log("Total songs in sources: " + totalSongsInSources);

		if ((!maxSongsDestination && maxSongsDestination !== 0) || maxSongsDestination < 0) {
			$scope.selectionData.totalSongsInDestination = totalSongsInSources;
		} else {
			$scope.selectionData.totalSongsInDestination = Math.min(maxSongsDestination, totalSongsInSources);
		}

		console.log("Total songs in destination: " + $scope.selectionData.totalSongsInDestination);
	});

	var addPlaylistDialogCtrl = function ($scope, $modalInstance, selectionData) {
		$scope.selectionData = selectionData;
		$scope.playlistInfo = {
			name: null
		};

		$scope.ok = function () {
			console.log("New playlist name: " + $scope.playlistInfo.name);
			SpotifyPlaylist.addPlaylist($scope.playlistInfo.name).then(function (playlist) {
				$modalInstance.close(playlist);
			});
		};

		$scope.cancel = function () {
			$modalInstance.dismiss('cancel');
		};
	};

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

	var confirmDialogCtrl = function ($scope, $modalInstance, selectionData) {
		$scope.selectionData = selectionData;

		$scope.ok = function () {
			$modalInstance.close();
		};

		$scope.cancel = function () {
			$modalInstance.dismiss('cancel');
		};
	};

	var progressDialogCtrl = function ($scope, $modalInstance, selectionData) {
		$scope.selectionData = selectionData;

		$scope.progressData = {
			total_songs: $scope.selectionData.totalSongsInDestination,
			num_tracks_read: 0,
			num_tracks_written: 0,
			percent_tracks_read: 0,
			percent_tracks_written: 0,
			finished_read: false,
			finished_write: false
		};

		$scope.$watchCollection("[progressData.num_tracks_read, progressData.total_songs]", function () {
			$scope.progressData.percent_tracks_read =
				$scope.progressData.num_tracks_read / $scope.progressData.total_songs * 100;
		});

		$scope.$watchCollection("[progressData.num_tracks_written, progressData.total_songs]", function () {
			$scope.progressData.percent_tracks_written =
					$scope.progressData.num_tracks_written / $scope.progressData.total_songs * 100;
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

		$scope.ok = function () {
			$modalInstance.close();
		};
	};

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
			var songs = [];
			var songNum = 0;

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

			$scope.selectionData.sources.forEach(function (source) {
				for (var i = 0; i < source.total; ++i) {
					songs.push(songNum++);
				}
			});

			console.log("Songs: " + songs);

			var chosen_songs = window.chance.pick(songs, $scope.selectionData.totalSongsInDestination);
			// Sort by integers
			chosen_songs.sort(function (a, b) { return a - b; });
			console.log("Chosen songs: " + chosen_songs);

			var total_chosen_songs = chosen_songs.length;
			var i = 0;

			var promises = [];

			$scope.selectionData.sources.forEach(function (source) {
				var current_offset = i;
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

				promises.push(SpotifySources.getSourceTracks(source, source_songs).then(null, null, function (progress) {
					$scope.$broadcast("progress:tracks_read", progress.delta);
					console.log("Collecting track info progress: " + JSON.stringify(progress));
				}));
			});

			$q.all(promises).then(
					// Success
					function (result) {
						$scope.$broadcast("progress:finished_read");

						var track_uris = [];

						result.forEach(function (tracks) {
							track_uris = track_uris.concat(tracks);
						});

						console.log("Track URIs to write to destination: " + track_uris);

						SpotifyPlaylist.setPlaylistTracks($scope.selectionData.destination.id, track_uris).then(
								// Success
								function (result) {
									$scope.$broadcast("progress:finished_write");
									// TODO: Do something after everything is finished
								},
								function (result) {
									// TODO: Do something on error
								},
								function (progress) {
									$scope.$broadcast("progress:tracks_written", progress.delta);
									console.log("Adding tracks to destination progress: " + (progress.current / progress.total * 100) + "%");
								}
						);

						console.log("Success");
					},
					// Error
					function (result) {
						// TODO: Handle error
					},
					function (progress) {
						console.log("$q.all.progress: " + JSON.stringify(progress));
						// TODO: Handle this but apparently it is not called??
					}
			);
		});
	};
});
