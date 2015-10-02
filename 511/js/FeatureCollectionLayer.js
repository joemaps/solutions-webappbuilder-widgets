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
   'esri/request',
   'esri/tasks/query',
   'esri/tasks/QueryTask'
   ],
   
function (declare, array, dojoEvent, lang, Color, on, DeferredList, GraphicsLayer, Graphic, SpatialReference, Extent, esriRequest, Query, QueryTask) {
    var featureCollectionLayer = declare('FeatureCollectionLayer', [GraphicsLayer], {
       
       //options: {name: "", map: map, id: "", renderer: <sourceLayerRenderer>, node: <updateNode>, features: <optional if url is supplied>, infoTemplate: <infoTemplate>}
      constructor : function(options) {
         this.name = options.name;
         this.displayOnPan = options.displayOnPan || false;
         this._map = options.map;
         this._id = options.id;       
         this.renderer = options.renderer;
         if (this.renderer) {
             this.setRenderer(this.renderer);
             if (typeof (this.renderer.attributeField) !== "undefined") {
                 this.symbolField = this.renderer.attributeField;
             }
         }
         this.node = options.node;
         this._features = options.features;
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
             if (this.symbolField) {
                 this._fieldNames.push(this.symbolField);
             }
         }
         if(this._fieldNames.length < 1) {
             //get all fields
             this._fieldNames = ["*"]
         }

         this.url = options.url;        
         if (typeof (this._features) === 'undefined') {
             if (typeof (this.url) !== 'undefined') {
                 this.loadData(this.url);
             } else {
                 this.loaded = "error";
             }
         }
         else {
             this.loadDataFromFeatureCollection();
             //var shouldUpdate = true;
             //if (this._features < 10000) {
             //    shouldUpdate = JSON.stringify(this._features) !== JSON.stringify(fs);
             //}
             //if (shouldUpdate) {
             //    this.graphics = fs;
                 this.countFeatures();
             //}

             this.loaded = true;        
         }

         if (this.loaded !== "error") {
             //base connections to update clusters during user/map interaction
             this._map.on('extent-change', lang.hitch(this, this.handleMapExtentChange));
             //handles the loading and mouse events on the graphics
             this.on('click', lang.hitch(this, this.handleClick));

             //this.testCount = 0;
             ///TESTERS
             //this.on('graphic-node-add', lang.hitch(this, function () {
             //    this.testCount += 1;
             //    console.log(this.testCount);
             //    if (this.node) {
             //        this.node.innerHTML = this.testCount;
             //    }
             //}));
             //this.on('graphic-node-remove', lang.hitch(this, function () {
             //    this.testCount -= 1;
             //    console.log(this.testCount);
             //    if (this.node) {
             //        this.node.innerHTML = this.testCount;
             //    }
             //}));
         }
      },

      loadDataFromFeatureCollection: function(){
          var sr = this._map.spatialReference;
          for (var i = 0; i < this._features.length; i++) {
              var item = this._features[i];
              if (typeof (item.geometry) !== 'undefined') {
                  var graphicOptions = null;
                  if (typeof (item.geometry.rings) !== 'undefined') {
                      graphicOptions = {
                          geometry: {
                              rings: item.geometry.rings,
                              "spatialReference": { "wkid": sr.wkid }
                          }
                      }
                  } else if (typeof (item.geometry.paths) !== 'undefined') {
                      graphicOptions = {
                          geometry: {
                              paths: item.geometry.paths,
                              "spatialReference": { "wkid": sr.wkid }
                          }
                      }
                  } else {
                      graphicOptions = {
                          geometry: {
                              x: item.geometry.x,
                              y: item.geometry.y,
                              "spatialReference": { "wkid": sr.wkid }
                          }
                      }
                  }
                  var gra = new Graphic(graphicOptions);
                  gra.setAttributes(item.attributes);
                  if (this.infoTemplate) {
                      gra.setInfoTemplate(this.infoTemplate);
                  }
                  this.add(gra);
              }
          }
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
                      var queries = [];
                      var i, j;
                      for (i = 0, j = results.length; i < j; i += max) {
                          var ids = results.slice(i, i + max);
                          queries.push(esriRequest({
                              "url": url + "/query",
                              "content": {
                                  "f": "json",
                                  "outFields": this._fieldNames.join(),
                                  "objectids": ids.join(),
                                  "returnGeometry": "true",
                                  "outSR": this._map.spatialReference.wkid
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
                              this.clear();
                              for (var i = 0; i < queryResults.length; i++) {
                                  for (var ii = 0; ii < queryResults[i][1].features.length; ii++) {
                                      var item = queryResults[i][1].features[ii];
                                      if (typeof (item.geometry) !== 'undefined') {
                                          var graphicOptions = null;
                                          if(typeof(item.geometry.rings) !== 'undefined'){
                                              graphicOptions = {
                                                  geometry: {
                                                      rings: item.geometry.rings,
                                                      "spatialReference": { "wkid": sr.wkid }
                                                  }
                                              }
                                          } else if(typeof(item.geometry.paths) !== 'undefined'){
                                              graphicOptions = {
                                                  geometry: {
                                                      paths: item.geometry.paths,
                                                      "spatialReference": { "wkid": sr.wkid }
                                                  }
                                              }
                                          } else {
                                              graphicOptions = {
                                                  geometry: {
                                                      x: item.geometry.x,
                                                      y: item.geometry.y,
                                                      "spatialReference": { "wkid": sr.wkid }
                                                  }
                                              }
                                          }
                                          var gra = new Graphic(graphicOptions);
                                          gra.setAttributes(item.attributes);
                                          if (this.infoTemplate) {
                                              gra.setInfoTemplate(this.infoTemplate);
                                          }
                                          this.add(gra);
                                      }
                                  }
                              }

                              //if (JSON.stringify(this._features) !== JSON.stringify(fs)) {
                                  //this.graphics = fs;
                                  this.countFeatures();
                              //}

                              this.loaded = true;
                          }
                      }));
                  }
              }));
          }
      },
      
      handleClick : function(event) {
         var g = event.graphic;
         this._map.infoWindow.setFeatures(g.attributes.Data);
         this._map.infoWindow.show(event.mapPoint);
         dojoEvent.stop(event);
      },

      handleMapExtentChange: function (event) {
          this.countFeatures();
      },

      refreshFeatures: function (url) {
          if (url) {
              this.loadData(url);
          } else if (this.url) {
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

        //may not do it this way in favor of the graphic node add/remove way
        //I would bet that the node add/remove is much faster with large data
      countFeatures : function() {
         if (this._map.infoWindow.isShowing)
            this._map.infoWindow.hide();
         var features = this.graphics;
         var total = 0;
         if (typeof (features) !== 'undefined') {
             if (features.length > 0) {
                 var mapExt = this._map.extent;
                 for (var i in features) {
                     var feature = features[i];
                     if (mapExt.intersects(feature.geometry)) {
                         total += 1;
                     }     
                 }
             }
             if (this.node) {
                 this.node.innerHTML = total;
             }
         }
      }
   });
   
   return featureCollectionLayer;
}); 