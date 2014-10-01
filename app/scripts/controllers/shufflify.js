'use strict';

var shufflifyApp = angular.module('shufflifyApp');

shufflifyApp.controller('MainCtrl', function ($scope, $http, SpotifySources, SpotifyLibrary,
		SpotifyPlaylist, AccessToken, $modal) {
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

		});
	};

	var confirmDialogCtrl = function ($scope, $modalInstance, selectionData) {
		// Inject Math into the scope so we can use math functions
		$scope.Math = window.Math;

		$scope.selectionData = selectionData;

		$scope.ok = function () {
			$modalInstance.close($scope.selected.item);
		};

		$scope.cancel = function () {
			$modalInstance.dismiss('cancel');
		};
	};
});
