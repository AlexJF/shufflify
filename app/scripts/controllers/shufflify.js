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
		maxSongsDestination: -1
	};

	$scope.newPlaylistName = "";

	$scope.$on('oauth:logout', forgetProfile);
	$scope.$on('oauth:expired', forgetProfile);
	$scope.$on('oauth:denied', forgetProfile);
	$scope.$on('oauth:profile', loadProfile);

	function loadProfile(event, profile) {
		console.log('Profile ' + profile);
		$scope.profile = profile;
		$http.defaults.headers.common.Authorization = 'Bearer ' + AccessToken.get().access_token;
		$('#btn-load-sources').show();
	}

	function forgetProfile() {
		$http.defaults.headers.common.Authorization = null;
		$('#btn-load-sources').hide();
	}

	$scope.loadSpotifyData = function () {
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

		if (maxSongsDestination < 0) {
			$scope.selectionData.totalSongsInDestination = totalSongsInSources;
		} else {
			$scope.selectionData.totalSongsInDestination = Math.min(maxSongsDestination, totalSongsInSources);
		}
	});

	$scope.addPlaylist = function (name) {
		SpotifyPlaylist.addPlaylist(name);
	};

	$scope.showConfirmDialog = function() {
		var confirmDialog = $modal.open({
			templateUrl: 'views/confirm.html',
			controller: confirmDialogCtrl,
			resolve: {
				selectionData: function () {
					return $scope.selectionData;
				}
			}
		});

		confirmDialog.result.then(function () {
			var songs = [];
			var songNum = 0;

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
					console.log("Collecting track info progress: " + JSON.stringify(progress));
				}));
			});

			$q.all(promises).then(
					// Success
					function (result) {
						var track_uris = [];

						result.forEach(function (tracks) {
							track_uris = track_uris.concat(tracks);
						});

						console.log("Track URIs to write to destination: " + track_uris);

						SpotifyPlaylist.setPlaylistTracks($scope.selectionData.destination.id, track_uris).then(
								// Success
								function (result) {
									// TODO: Do something after everything is finished
								},
								function (result) {
									// TODO: Do something on error
								},
								function (progress) {
									console.log("Adding tracks to destination progress: " + (progress.current / progress.total) + "%");
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

	var confirmDialogCtrl = function ($scope, $modalInstance, selectionData) {
		// Inject Math into the scope so we can use math functions
		$scope.Math = window.Math;

		$scope.selectionData = selectionData;

		$scope.ok = function () {
			$modalInstance.close();
		};

		$scope.cancel = function () {
			$modalInstance.dismiss('cancel');
		};
	};
});
