/**
 * Created by Anthony on 31/08/2015.
 */
(function () {
  'use strict';
  // Prepare the 'calculator' module for subsequent registration of controllers and delegates
  angular.module('calculator', [ 'ngMaterial', 'angular-rickshaw' ]);

  angular
    .module('calculator')
    .controller('HomeCtrl', HomeCtrl);
  function HomeCtrl($scope, $mdToast, $mdDialog, $http, $locale) {
    // Init object with default value
    $scope.user = {};
    $scope.roi = {
      startDate : new Date(),
      startupFixed : 400,
      startupPerUnit : 10,
      quantity : 20
    };
    $scope.series = [{
      name: 'ROI',
      color: 'steelblue',
      data : []
    }];
    $scope.options = {
      renderer: 'line',
      min: 'auto'
    };
    $scope.features = {
      yAxis: {
        tickFormat : 'unrespected value!' //Rickshaw.Fixtures.Number.formatKMBT 
      },
      xAxis: {
        timeUnit : 'month'
      }
    };
    $scope.series2 = [{
      name: 'ROI',
      color: 'steelblue',
      data : []
    }];
    $scope.options2 = {
      renderer: 'line',
      min: 'auto'
    };
    $scope.features2 = {
      yAxis: {
        tickFormat : 'unrespected value!' //Rickshaw.Fixtures.Number.formatKMBT 
      },
      xAxis: {
        tickFormat : Rickshaw.Fixtures.Number.formatKMBT
      }
    };
    // $scope.y_ticks = new Rickshaw.Graph.Axis.Y({
    //   element: document.getElementById('y_axis'),
    //   graph: graph,
    //   tickFormat : Rickshaw.Fixtures.Number.formatKMBT
    // });

    $scope.earnings = {};
    $scope.electricity = {price: 0.09};
    $scope.facts = {
      difficulty: 0,
    };
    $scope.network = {
      diffIncrease: 3,
      linearDiff: false,
      blockTime: 600,
      ethPrice: 300.0
    };
    $scope.gpus = [];
    $scope.currency = $locale.NUMBER_FORMATS.CURRENCY_SYM;
    $scope.currencies = [
      {
        name: 'USD',
        sym: $locale.NUMBER_FORMATS.CURRENCY_SYM
      }
    ];

    $scope.showSimpleToast = function (message) {
      $mdToast.show(
        $mdToast.simple()
          .content(message)
          .position('bottom right')
          .hideDelay(3000)
      );
    };

    $scope.selectGPU = function () {
      // Update init capital
      if ($scope.user.gpu.price) {
        //Get GPU price
        $scope.earnings.capitalPerUnit = getGpuPriceFromEbay($scope.user.gpu.name);
        // Failed to get price from ebay
        if ($scope.earnings.capitalPerUnit === 0) {
          $scope.earnings.capitalPerUnit = $scope.user.gpu.price;
        }
        if ($scope.user.gpu.vendor != "Cloud") {
          $scope.user.electricity = true;
        }
      }
      // Compute profits
      $scope.computeEnergyCosts();
    };

    // Triggered after angular changes $scope.user.scenario to selection.
    $scope.selectScenario = function () {
      // If the asic is a number, then index into asics.json array, else
      // copy the object over directly to the model.
      if (typeof $scope.user.scenario.asic == 'number') {
        $scope.user.gpu = $scope.gpus[$scope.user.scenario.asic];
      } else {
        $scope.user.gpu = $scope.user.scenario.asic;
      }
      $scope.roi = $scope.user.scenario.roi;
      $scope.roi.startDate = new Date(moment($scope.user.scenario.roi.startDate, "YYYY-MM-DD"));
      $scope.electricity = $scope.user.scenario.electricity;
      $scope.network = $scope.user.scenario.network;
      fillPrices($scope.user.scenario.price);
      $scope.selectGPU();
    };

    $scope.saveScenario = function () {
      var storageItem = localStorage.getItem("cashflow_scenarios");
      if( storageItem === null )
        storageItem = "[]";
      var userScenarios = JSON.parse(storageItem);
      var title = prompt("Please enter a scenario title", "Scenario 1");
      var tempRoi = $scope.roi;
      tempRoi.startDate = moment($scope.roi.startDate).format("YYYY-MM-DD");
      var currentScenario = {
        "title": title,
        "type": "user",
        "roi": tempRoi,
        "electricity": $scope.electricity,
        "network": $scope.network,
        "price": {
          "usd": $scope.user.price.usd.toString()
        },
        "asic": {
          "hashrate": $scope.user.gpu.hashrate,
          "power": $scope.user.gpu.power,
          "price": $scope.earnings.capitalPerUnit
        }
      };
      userScenarios.push(currentScenario);
      localStorage.setItem("cashflow_scenarios", JSON.stringify(userScenarios));
      $scope.myScenarios = userScenarios;
    };

    // Currently unused, planned for "period ending: 2016-10-25" style output.
    $scope.relCycleToDate = function (relCycle) {
      var dayOffset = relCycle * 14;
      var cycleDate = moment($scope.roi.startDate).add(dayOffset, 'days').format("MMM DD YYYY");
      return cycleDate;
    };

    $scope.relCycleToEpoch = function (relCycle) {
      var cycleEpoch = moment($scope.roi.startDate).unix() + (86400 * 14 * relCycle);
      return cycleEpoch;
    };

    $scope.cycleEarning = function (relCycle) {
      var diffPower = (100 + $scope.network.diffIncrease)/100;
      var startMoment = moment($scope.roi.startDate);
      var preDays = startMoment.diff(moment(), 'days');
      // TODO: Handle non exact cycle starts (initial partial cycle).
      var preCycles = Math.floor(preDays / 14);
      var futureDiff;
      if ($scope.network.linearDiff) {
        diffPower -= 1;
        futureDiff = $scope.facts.difficulty + ($scope.facts.difficulty * (preCycles + relCycle) * diffPower);
      } else {
        futureDiff = $scope.facts.difficulty * Math.pow(diffPower, (preCycles + relCycle));
      }
      // TODO: fix logic for mid-cycle split block reward containing block 420000.
      var cycleBlock = $scope.facts.nowBlock + ((preCycles + relCycle) * 2016);
      var reward = 50 * Math.pow(0.5, Math.floor(cycleBlock / 210000));
      var winWait = futureDiff * Math.pow(2,32) / ($scope.user.gpu.hashrate * $scope.roi.quantity * 1e9);
      var blocksPerCycle = 1209600 / winWait; // (60*60*20*14) secs per cycle.
      var coinsPerCycle = blocksPerCycle * reward;
      return coinsPerCycle;
    };

    $scope.getCycleProfit = function (relCycle, price) {
      var cycleElec = $scope.user.gpu.costs * 336; // 24*14 hours per cycle.
      var cycleCoins = $scope.cycleEarning(relCycle); 
      var cycleIncome = cycleCoins * price;
      var cycleResults = { coins: cycleCoins, costs: cycleElec, profit: cycleIncome - cycleElec};
      //console.log(cycleResults);
      return cycleResults;
    };

    /**
     * Compute profits
     */
    $scope.computeProfits = function () {

      $scope.earnings.tab = [];
      var graphData = [];
      var graphBreakEven = [];
      $scope.earnings.totalStartupCost = $scope.roi.startupFixed + ($scope.roi.startupPerUnit * $scope.roi.quantity);
      $scope.earnings.initialROI = (($scope.earnings.capitalPerUnit * $scope.roi.quantity) + $scope.earnings.totalStartupCost) * -1;
      var ROI = $scope.earnings.initialROI;
      for (var i = 0; i < 150; i++) { //If you can't do it in 6 years...
        var cycleResults = $scope.getCycleProfit(i, $scope.user.price.usd); 
        ROI += cycleResults.profit;
        //output profits.
        $scope.earnings.tab.push({
          label: $scope.relCycleToDate(i),
          eth: cycleResults.coins,
          price: cycleResults.profit,
          roi: ROI
        });
        var graphX = $scope.relCycleToEpoch(i);
        graphData.push({x:graphX, y:ROI});
        graphBreakEven.push({x:graphX, y:0});
        if (cycleResults.profit < 0)
          break;
      }

      $scope.series[0] = {
        name: 'ROI',
        color: 'steelblue',
        data: graphData
      };
      $scope.series[1] = {
        name: 'Break-even',
        color: 'lightcoral',
        data: graphBreakEven
      };

      // Compute ROI if needed
      $scope.computeRoi();
      $scope.computeConvexity(240, 800);
    };

    $scope.computeConvexity = function (priceMin, priceMax) {
      var graphData = [];
      var breakEvenPrice;
      for (var price = priceMin; price <= priceMax; price +=10) {
        var ROI = $scope.earnings.initialROI;
        for (var i = 0; i < 150; i++) { //If you can't do it in 6 years...
          var cycleResults = $scope.getCycleProfit(i, price); 
          if (cycleResults.profit < 0)
            break;
          ROI += cycleResults.profit;
        }
        graphData.push({ x: price, y: ROI });
        if (breakEvenPrice === undefined && ROI > 0) {
          // only draw the second series once.
          $scope.series2[1] = {
            name: 'Break-even',
            color: 'lightcoral',
            data: [ { x: price, y: $scope.earnings.initialROI },
            { x: price, y: 0 }
            ]
          };
          breakEvenPrice = price;
        }
      }
      $scope.series2[0] = {
        name: 'Price Convexity',
        color:'steelblue',
        data: graphData
      };
    };

    /**
     * Async load of GPU list
     */
    $scope.loadGPUs = function () {
      // Fill list of GPUs
      $http.get("./assets/json/asics.json")
        .success(function (data) {
          $scope.gpus = data;
        }).error(function (data, status) {
          console.log("And we just got hit by a " + status + " !!!");
        });
    };

    /**
     * Async load of Scenario list
     */
    $scope.loadScenarios = function () {
      var storageItem = localStorage.getItem("cashflow_scenarios");
      if( storageItem === null )
        storageItem = "[]";
      $scope.scenarios = JSON.parse(storageItem); 
      $http.get("./assets/json/scenarios.json")
        .success(function (data) {
            $scope.scenarios = $scope.scenarios.concat(data);
        }).error(function (data, status) {
          console.log("And we just got hit by a " + status + " !!!");
        });
      $scope.loadGPUs();
    };

    /**
     * Convert Watts to KWh for a given time (in hours)
     * @param watts
     * @param hours
     * @returns {number}
     */
    var convertWtoKWh = function (watts, hours) {
      return hours * watts / 1000;
    };

    /**
     * Compute energy costs
     */
    $scope.computeEnergyCosts = function () {
      // Avoid unnecessary calculation if no GPU selected
      if ($scope.user.gpu) {
        if ($scope.user.electricity && $scope.user.gpu.power) {
          $scope.user.gpu.costs = convertWtoKWh($scope.electricity.price, 1) * $scope.user.gpu.power * $scope.roi.quantity;
        } else {
          $scope.user.gpu.costs = undefined;
        }
        // Compute profits again
        $scope.computeProfits();
      }
    };
    /**
     * Compute ROI
     */
    $scope.computeRoi = function () {
      if ($scope.earnings.capitalPerUnit) {
        var i=0; 
        while($scope.earnings.tab[i].roi < 0 && i < $scope.earnings.tab.length -1)
          i++;
        if ($scope.earnings.tab[i].roi >= 0)
          $scope.earnings.roiDate = $scope.earnings.tab[i].label;
        else
          $scope.earnings.roiDate = "N/A";
        var unplugDate;
        if ($scope.earnings.tab.length > 1) {
          unplugDate = $scope.earnings.tab[$scope.earnings.tab.length -2];
        } else {
          unplugDate = $scope.earnings.tab[$scope.earnings.tab.length -1];
        }
        $scope.earnings.totalProfit = unplugDate.roi;
        $scope.earnings.percentProfit = $scope.earnings.totalProfit / $scope.earnings.tab[0].roi * -100;
        $scope.earnings.annProfit = $scope.earnings.percentProfit * 365 / moment(unplugDate.label, "MMM DD YYYY").diff(moment($scope.roi.startDate), 'days');
      }
    };

    /**
     * Get best price from Ebay
     * @param name
     * @returns {number}
     */
    var getGpuPriceFromEbay = function (name) {
      return 0;
      // TODO http://developer.ebay.com/Devzone/finding/Concepts/MakingACall.html
      //$http.post("http://coinmarketcap-nexuist.rhcloud.com/api/eth", {
      //  "tns.findItemsByKeywordsRequest": {"keywords": name}
      //}).success(function (data) {
      //  return 0;
      //}).error(function (data, status) {
      //  console.log("And we just got hit by a " + status + " !!!");
      //  return 0;
      //});
    };

    /**
     * Reset GPU selection
     */
    $scope.resetGPU = function () {
      var tmp = $scope.user.gpu.hashrate;
      $scope.user.gpu = {
        hashrate: tmp
      };
    };

    /**
     * Get all useful data
     */
    // TODO: refactor get requests into function call.
    //
    // function multiCall(requests) {
    //   for (var i=0; i <requests.length; i++) {
    //     var request = requests[i];
    //     $http.get(request.url)
    //       .success(function (data) {
    //         $scope.network[request.field] = data;
    //         fillPrices(data.price);
      //
      //       }).error(function (data, status) {
      //         $scope.showSimpleToast("Failed to load Network data from " + request.url);
      //         console.log("And we just got hit by a " + status + " !!!");
      //         $scope.network[request.field] = 0;
      //       });
      //    }
      // }
      // function clearUserField(name) {
      //   $scope.user[name] = 0;
      //   }
      // 
      // var requests = [ {url:"foo", field:"price"},
      //                  {url:"bar", field:"difficulty"},
      //                  {url:"baz", field:"blockcount"}
      //                ]
      //
      // multiCall(requests);
      //
      //
    $scope.init = function () {
      $http.get("https://coinmarketcap-nexuist.rhcloud.com/api/btc")
        .success(function (data) {
          $scope.facts.market = data;
          fillPrices(data.price);
        }).error(function (data, status) {
          $scope.showSimpleToast("Failed to load Network data from coinmarketcap-nexuist.rhcloud.com :-/");
          console.log("And we just got hit by a " + status + " !!!");
        });
      $http.get("https://blockexplorer.com/api/status?q=getDifficulty")
        .success(function (resp) {
          $scope.facts.difficulty = Math.floor(resp.difficulty);
        }).error(function (data, status) {
          $scope.showSimpleToast("Failed to load Network data from blockexplorer.com :-/");
          console.log("And we just got hit by a " + status + " HTTP status !!!");
          //DEV
          $scope.facts.difficulty = 103880340815;
        });
      $http.get("https://blockexplorer.com/api/status?q=getBlockCount")
        .success(function (resp) {
          $scope.facts.nowBlock = resp.blockcount;
        }).error(function (data, status) {
          $scope.showSimpleToast("Failed to load Network data from blockexplorer.com :-/");
          console.log("And we just got hit by a " + status + " HTTP status !!!");
          $scope.facts.nowBlock = 1;
        });
    };

    /**
     * Fill prices (str -> float)
     * @param price
     */
    var fillPrices = function (price) {
      $scope.user.price = {};
      $scope.user.price.usd = parseInt(price.usd, 10);
    };

    /**
     * Reset inputs
     */
    $scope.reset = function () {
      $scope.user = {};
      fillPrices($scope.facts.market.price);
      $scope.showSimpleToast('Parameters reset');
    };

    $scope.showAdvanced = function (ev) {
      $mdDialog.show({
        controller: DialogController,
        templateUrl: 'src/calculator/html/powersupply.tmpl.html',
        parent: angular.element(document.body),
        targetEvent: ev,
        clickOutsideToClose: true,
        locals: {
          gpu: $scope.user.gpu
        }
      })
        .then(function (power) {
          $scope.user.gpu.power = power;
          $scope.computeEnergyCosts();
          $scope.status = 'You said the information was "' + power + '".';
        }, function () {
          $scope.status = 'You cancelled the dialog.';
        });
    };
    function DialogController($scope, $mdDialog, gpu) {
      $scope.gpu = gpu;

      $scope.hide = function () {
        $mdDialog.hide($scope.gpu.power);
      };
      $scope.cancel = function () {
        $mdDialog.cancel();
      };
    }
  }
})();
