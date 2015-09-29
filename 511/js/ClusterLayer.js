///////////////////////////////////////////////////////////////////////////
// Copyright © 2015 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([
   'dojo/_base/declare',
   'dojo/_base/array',
   'dojo/_base/event',
   'dojo/_base/lang',
   'dojo/_base/Color',
   'dojo/on',
   'dojo/DeferredList',
   'esri/layers/GraphicsLayer',
   'esri/graphic',
   'esri/SpatialReference',
   'esri/geometry/Extent',
   'esri/geometry/Point',
   'esri/symbols/PictureMarkerSymbol',
   'esri/symbols/SimpleMarkerSymbol',
   'esri/symbols/SimpleLineSymbol',
   'esri/request',
   'esri/tasks/query',
   'esri/tasks/QueryTask'
   ],
   
function (declare, array, dojoEvent, lang, Color, on, DeferredList, GraphicsLayer, Graphic, SpatialReference, Extent, Point, PictureMarkerSymbol, SimpleMarkerSymbol, SimpleLineSymbol, esriRequest, Query, QueryTask) {
   var clusterLayer = declare('ClusterLayer', [GraphicsLayer], {
       
      constructor : function(options) {
         this.name = options.name;

         //basic esri.layers.GraphicsLayer option(s)
         this.displayOnPan = options.displayOnPan || false;

         //set the map
         this._map = options.map;
         
         this.clusterSize = options.clusterSize || 120;

         var colorStr = options.color || '#ff0000';
         this.color = Color.fromString(colorStr);
         
         this.icon = options.icon;      
         this.node = options.node;

         //base connections to update clusters during user/map interaction
         this._map.on('extent-change', lang.hitch(this, this.handleMapExtentChange));

          //holds all the features for this cluster layers
         this._features = options.features;

         this.query = options.query;

         this.queryPending = false;

         this.infoTemplate = options.infoTemplate;

         this._fieldNames = [];
         //this will limit the fields to those fequired for the popup
         if (this.infoTemplate) {         
             if (typeof (this.infoTemplate.info) !== 'undefined') {
                 var fieldInfos = this.infoTemplate.info.fieldInfos;
                 for (var i = 0; i < fieldInfos.length; i++) {
                     if (fieldInfos[i].visible) {
                         this._fieldNames.push(fieldInfos[i].fieldName);
                     }
                 }
             }
         }
         if(this._fieldNames.length < 1) {
             //get all fields
             this._fieldNames = ["*"]
         }

         this.url = options.url;
         if (typeof (this.url) !== 'undefined') {
             this.loadData(this.url);
         }

         this.refreshInterval = options.refreshInterval;

          //object to store layer stats so the layer would know how to update itself..but think it may be better to handle all in the main widget
         this.refreshEnabled = options.refreshEnabled;

         //connects for cluster layer itself that handles the loading and mouse events on the graphics
         this.on('click', lang.hitch(this, this.handleClick));
      },

      loadData: function (url) {
          if (url.length > 0) {
              var q = new Query();
              q.where = "1=1";
              q.returnGeometry = false;
              this.queryPending = true;
              var qt = new QueryTask(url);
              qt.executeForIds(q).then(lang.hitch(this, function (results) {
                  var max = 1000;
                  if (results) {
                      this.queryIDs = results;
                      var queries = [];
                      var i, j;
                      for (i = 0, j = this.queryIDs.length; i < j; i += max) {
                          var ids = this.queryIDs.slice(i, i + max);
                          queries.push(esriRequest({
                              "url": url + "/query",
                              "content": {
                                  "f": "json",
                                  "outFields": this._fieldNames.join(),
                                  "objectids": ids.join(),
                                  "returnGeometry": "true"
                              }
                          }));
                      }

                      this._features = [];

                      var queryList = new DeferredList(queries);
                      queryList.then(lang.hitch(this, function (queryResults) {
                          this.queryPending = false;
                          if (queryResults) {
                              var sr = this._map.spatialReference;
                              var fs = [];
                              for (var i = 0; i < queryResults.length; i++) {
                                  for (var ii = 0; ii < queryResults[i][1].features.length; ii++) {
                                      var item = queryResults[i][1].features[ii];
                                      if (typeof (item.geometry) !== 'undefined') {
                                          var geom = new Point(item.geometry.x, item.geometry.y, sr);
                                          var gra = new Graphic(geom);
                                          gra.setAttributes(item.attributes);
                                          if (this.infoTemplate) {
                                              gra.setInfoTemplate(this.infoTemplate);
                                          }
                                          fs.push(gra);
                                      }
                                  }
                              }

                              if (JSON.stringify(this._features) !== JSON.stringify(fs)) {
                                  this._features = fs;
                                  this.clusterFeatures();
                              }

                              this.loaded = true;
                          }
                      }));
                  }
              }));
          }
      },
      
      //click
      handleClick : function(event) {
         var gra = event.graphic;
         this._map.infoWindow.setFeatures(gra.attributes.Data);
         this._map.infoWindow.show(event.mapPoint);
         //this._map.infoWindow.maximize();
         dojoEvent.stop(event);
      },

      //re-cluster on extent change
      handleMapExtentChange: function (event) {
         if(event.levelChange) {
            this.clusterFeatures();
         } else if (event.delta){
            var delta = event.delta;
            var dx = Math.abs(delta.x);
            var dy = Math.abs(delta.y);
            if (dx > 50 || dy > 50)
               this.clusterFeatures();
         }
      },

      refreshFeatures: function () {
          if (this.url) {
              this.loadData(this.url);
          }
      },

      flashFeatures: function () {
          //var cls = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([255, 0, 0]), 10);
          //var cls2 = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([0, 255, 0]), 5);
          //var cls3 = new SimpleLineSymbol(SimpleLineSymbol.STYLE_NULL, new Color(0, 0, 0, 0), 0);
          //var x = 0;

          //this.s = setInterval(lang.hitch(this, function () {
          //    for (var i = 0; i < this.graphics.length; i++) {
          //        var g = this.graphics[i];
          //        if (x % 2) {
          //            var s = g.symbol;
          //            if (typeof (s.setOutline) === 'function') {
          //                s.setOutline(cls)
          //            }
          //            g.setSymbol(s);
          //        } else {
          //            var s = g.symbol;
          //            if (typeof (s.setOutline) === 'function') {
          //                s.setOutline(cls2)
          //            }
          //            g.setSymbol(s);
          //        }
          //    }
          //    this.redraw();
          //    x = x + 1;
          //    if (x == 5) {
          //        clearInterval(this.s);
          //        for (var i = 0; i < this.graphics.length; i++) {
          //            var g = this.graphics[i];
          //            var s = g.symbol;
          //            s.setOutline(cls3)
          //            g.setSymbol(s);
          //        }
          //        this.redraw();
          //    }
          //}), 500);
      },

      //set features
      setFeatures: function (features) {
          //don't think typeof test is best here...TODO
          if (typeof (features) !== 'string') {
              this._features = features;
              this.clusterFeatures();
          } else {
              ///THIS WORKS FINE>>> TESTING BELOW TO SEE IF I CAN GET THE Recursive loop up and going
              //var requestHandle = esriRequest({
              //    "url": features + "/query",
              //    "content": {
              //        "f": "json",
              //        "where": "1=1",
              //        "outFields": "*",
              //        "returnGeometry": "true"
              //    }
              //});

              //var b = lang.hitch(this, requestHandle.then(function (res) {
              //    return res;
              //}).then(lang.hitch(this, function (r) {
              //    var sr = this._map.spatialReference;
              //    var fs = [];
              //    for (var i = 0; i < r.features.length; i++) {
              //        var item = r.features[i];
              //        if (typeof (item.geometry) !== 'undefined') {
              //            var geom = new Point(item.geometry.x, item.geometry.y, sr);
              //            var gra = new Graphic(geom);
              //            gra.setAttributes(item.attributes);
              //            if (this.infoTemplate) {
              //                gra.setInfoTemplate(this.infoTemplate);
              //            }
              //            fs.push(gra);
              //        }
              //        else {
              //            console.log("Why is the geom null: " + item);
              //        }
              //    }

              //    if (JSON.stringify(this._features) !== JSON.stringify(fs)) {
              //        this._features = fs;
              //        this.clusterFeatures();
              //    }
              //})));
              if (!this.queryPending) {
                  //this.getFeatures(features);
              }
          }     
      },

      getFeatures: function (url) {
          var qIDs = null;
          if (typeof (this.queryIDs) !== 'undefined') {
              qIDs = this.queryIDs;
          }

          var requestHandle = esriRequest({
              "url": url + "/query",
              "content": {
                  "f": "json",
                  "where": "1=1",
                  "outFields": "*",
                  "returnGeometry": "true"
              }
          });

          var b = lang.hitch(this, requestHandle.then(function (res) {
              return res;
          }).then(lang.hitch(this, function (r) {
              var sr = this._map.spatialReference;
              var fs = [];
              for (var i = 0; i < r.features.length; i++) {
                  var item = r.features[i];
                  if (typeof (item.geometry) !== 'undefined') {
                      var geom = new Point(item.geometry.x, item.geometry.y, sr);
                      var gra = new Graphic(geom);
                      gra.setAttributes(item.attributes);
                      if (this.infoTemplate) {
                          gra.setInfoTemplate(this.infoTemplate);
                      }
                      fs.push(gra);
                  }
                  else {
                      console.log("Why is the geom null: " + item);
                  }
              }

              if (JSON.stringify(this._features) !== JSON.stringify(fs)) {
                  this._features = fs;
                  this.clusterFeatures();
              }
          })));
      },

      //set color
      setColor : function(color) {
          this.color = Color.fromString(color);
      },

      // cluster features
      clusterFeatures : function(redraw) {
         this.clear();
         if (this._map.infoWindow.isShowing)
            this._map.infoWindow.hide();
         var features = this._features;
         var total = 0;
         if (typeof (features) === 'string') {
             this.setFeatures(features);
         } else if (typeof (features) !== 'undefined') {
             if (features.length > 0) {

                 var clusterSize = this.clusterSize;
                 var clusterGraphics = new Array();
                 var sr = this._map.spatialReference;
                 var mapExt = this._map.extent;
                 var o = new Point(mapExt.xmin, mapExt.ymax, sr);

                 var rows = Math.ceil(this._map.height / clusterSize);
                 var cols = Math.ceil(this._map.width / clusterSize);
                 var distX = mapExt.getWidth() / this._map.width * clusterSize;
                 var distY = mapExt.getHeight() / this._map.height * clusterSize;

                 for (var r = 0; r < rows; r++) {
                     for (var c = 0; c < cols; c++) {
                         var x1 = o.x + (distX * c);
                         var y2 = o.y - (distY * r);
                         var x2 = x1 + distX;
                         var y1 = y2 - distY;

                         var ext = new Extent(x1, y1, x2, y2, sr);

                         var cGraphics = new Array();
                         for (var i in features) {
                             var feature = features[i];
                             if (ext.contains(feature.geometry)) {
                                 total += 1;
                                 cGraphics.push(feature);
                             }
                         }
                         if (cGraphics.length > 0) {
                             var cPt = this.getClusterCenter(cGraphics);
                             clusterGraphics.push({
                                 center: cPt,
                                 graphics: cGraphics
                             });
                         }
                     }
                 }

                 //add cluster to map
                 for (var g in clusterGraphics) {
                     var clusterGraphic = clusterGraphics[g];
                     var count = clusterGraphic.graphics.length;
                     var data = clusterGraphic.graphics;
                     var size = 40 + parseInt(count / 40);
                     var size2 = size - (size / 4);
                     var symColor = this.color.toRgb();
                     var cls = new SimpleLineSymbol(SimpleLineSymbol.STYLE_NULL, new Color(0, 0, 0, 0), 0);
                     //var cls = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([255, 255, 255]), 2);
                     var csym = new SimpleMarkerSymbol(SimpleMarkerSymbol.STYLE_CIRCLE, size, cls, new Color([symColor[0], symColor[1], symColor[2], 0.5]));
                     var psym = new PictureMarkerSymbol(this.icon, size -11, size -11);
                     var psym2 = new PictureMarkerSymbol(this.icon, size2 -13, size2 -13);
                     var cls2 = new SimpleLineSymbol(SimpleLineSymbol.STYLE_NULL, new Color(0, 0, 0, 0), 0);
                     //var cls2 = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([255, 255, 255]), 1);
                     var csym2 = new SimpleMarkerSymbol(SimpleMarkerSymbol.STYLE_CIRCLE, size2, cls2, new Color([symColor[0], symColor[1], symColor[2], 0.5]));

                     var attr = {
                         Count: count,
                         Data: data
                     };
                     if (count > 1) {
                         this.add(new Graphic(clusterGraphic.center, csym, attr));
                         this.add(new Graphic(clusterGraphic.center, psym, attr));
                     } else {
                         var pt = clusterGraphic.graphics[0].geometry;
                         this.add(new Graphic(pt, csym2, attr));
                         this.add(new Graphic(pt, psym2, attr));
                     }
                 }
             }

             if (this.node)
                 this.node.innerHTML = total;
         }
      },
      
      getClusterCenter: function (graphics) {
         var xSum = 0;
         var ySum = 0;
         var count = graphics.length;
         array.forEach(graphics, function(graphic) {
            xSum += graphic.geometry.x;
            ySum += graphic.geometry.y;
         }, this);
         var cPt = new Point(xSum / count, ySum / count, graphics[0].geometry.spatialReference);
         return cPt;
      }
   });
   
   return clusterLayer;
   
}); 