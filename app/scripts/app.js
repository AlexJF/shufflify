'use strict';

var shufflifyApp = angular.module('shufflifyApp', [
	'ngSanitize',
	'oauth',
	'ngRoute',
	'spotifyServices',
	'ui.select',
	'ui.bootstrap',
	'truncate',
]);

shufflifyApp.config(function ($routeProvider, $locationProvider, uiSelectConfig) {
	$routeProvider
			.when('/', {
				templateUrl: 'views/main.html',
				controller: 'MainCtrl'
			})
			.otherwise({
				redirectTo: '/'
			});
	$locationProvider.html5Mode(true).hashPrefix('!');
	uiSelectConfig.theme = 'bootstrap';
});
