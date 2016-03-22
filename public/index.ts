///<reference path="../typings/tsd.d.ts"/>

var app = angular.module("mariejs", []);

class MainController {
	interpreter: MarieInterpreter;
	code: string = "";
	codeError: string = "";

	static $inject = ["$scope"];
	constructor($scope: angular.IScope) {
		$scope['mc'] = this;
	}

	updateCode() {
		this.codeError = "";
		try {
			this.interpreter = new MarieInterpreter(this.code);
		}
		catch (err) {
			this.codeError = err.message;
		}
	}
}
app.controller("MainController", MainController);

app.directive('ngAllowTab', function () {
    return function (scope, element, attrs) {
        element.bind('keydown', function (event) {
            if (event.which == 9) {
                event.preventDefault();
                var start = this.selectionStart;
                var end = this.selectionEnd;
                element.val(element.val().substring(0, start) 
                    + '\t' + element.val().substring(end));
                this.selectionStart = this.selectionEnd = start + 1;
                element.triggerHandler('change');
            }
        });
    };
});

app.directive('memoryTable', () => {
	return {
		restrict: 'A',
		scope: {
			memory: '='
		},
		template: `
<div class="mariejs-memoryTable">
	<table class="header">
		<thead>
			<tr>
				<th></th>
				<th ng-repeat="col in cols">+{{col | toHex}}</th>
			</tr>
		</thead>
	</table>
	<div class="scrollable">
		<table class="table-striped">
			<tbody>
				<tr ng-repeat="row in rows">
					<th>{{row | toHex | padHex:3}}</th>
					<td ng-repeat="col in cols">{{memory[row + col] | toHex | padHex:4}}</td>
				</tr>
			</tbody>
		</table>
	</div>
</div>`,
		controller: ["$scope", ($scope: angular.IScope) => {
			function fillMemory() {
				if (!$scope['memory']) {
					$scope['memory'] = new Int16Array(2048);
				}
				
				$scope['cols'] = [];
				for (var i = 0; i < 16; i++) {
					$scope['cols'].push(i);
				}

				$scope['rows'] = [];
				for (var i = 0; i < $scope['memory'].length; i += 16) {
					$scope['rows'].push(i);
				}
			}
			fillMemory();

			$scope.$on('memoryUpdate', (e, address, newValue, oldValue) => {
				
			})
		}]
	};
});

app.filter('toHex', () => (x) => x.toString(16).toUpperCase());
app.filter('padHex', () => (x: string, padSize = 4) => {
	var r = "";
	for (var i = 0; i < padSize - x.length; i++) r += "0";
	return r + x;
});
app.filter('numberArrayToString', () => (x: Array<number>) => x && x.map((v)=>String.fromCharCode(v)).join());