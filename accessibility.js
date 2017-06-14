/*jshint esversion: 6 */
/*jshint indent: 2 */

/* leaflet map, overlay, canvas */
let M;
let O;
let C;

/* webgl context, shader program, processing unit */
let GL;

let FBO;

let   debugProgram,
      focusProgram,
      initProgram,
      jfaProgram,
      circleProgram,
      voronoiProgram,
      finalProgram;

let   colorRamp,
      focusTexture,
      contextTexture,
      readTexture,
      writeTexture,
      maskTexture;

let quadBuffer,
    circleBuffer;

// CIRCLE VARIABLES
var centerX = 0.0;
var centerY = 0.0;
var centerZ = 0.0;
var radius = 0.2;
var numberOfTriangles = 80; 
var numberOfVertices = numberOfTriangles + 2;

var circleVerticesX = [];
var circleVerticesY = [];
var circleVerticesZ = [];
var allCircleVertices = [];

/* enable instrumentation to console log */
const MEASURE_TRANSMISSION = false;
const MEASURE_RENDERING = false;
let MEASURE_ID = 0;

/* center berlin, default zoom */
const DEFAULT_CENTER = [52.467734, 13.292005];
const DEFAULT_ZOOM = 10;

/* default travel time, medium and operand */
let TRAVEL_TIME = 7200;
const TRAVEL_MAX_ROUTING = 7680;    // to avoid spikes around the network we have to make this value higher than TRAVEL_TIME
let TRAVEL_MEDIUM = 'bike';
let TRAVEL_OPERAND = 'union';
const _DATE = new Date();
const TRAVEL_DATE = _DATE.getFullYear() * 10000
  + (_DATE.getMonth()+1) * 100
  + _DATE.getDate();
const TRAVEL_DATE_TIME = _DATE.getHours() * 60 * 60
  + _DATE.getMinutes() * 60
  + _DATE.getSeconds();
let TRAVEL_DECIMAL_PLACES = 10;
const TRAVEL_EDGE_CLASSES = [1, 11, 12, 13, 14, 15, 16, 21, 22, 31, 32,
      41, 42, 51, 63, 62, 71, 72, 81, 91, 92, 99];

/* binary geometry tiles */
let GLTF_TILES;
let TEXTURE_IMAGE = new Image();

/* travel time control (r360) and markers */
let CONTROL_TIME;
let CONTROL_MEDIUM;
let CONTROL_OPERAND;
let MARKER_ORIGIN_PRIMAR;
let MARKER_ORIGIN_SECOND;

/* cache for all tiles, count requests and responses */
let TILE_CACHE;
let TILE_CACHE_NUM_REQU = 0;
let TILE_CACHE_NUM_RESP = 0;

/* selected parameters and hash */
let TILE_PARAMETERS = new Object();
let TILE_PARAMETERS_SHA1;

/**
 * ASYNCHRONOUS FUNCTION FOR LOADING THE COLOR RAMP IMAGE
 *
 * @param {Object} img - color ramp image
 * @param {callback} callback - callback function that creates the texture
 */
function loadColorRamp(img, callback){
  img.src = "img/mi-r360.png";
  img.onload = callback;
}

/**
 * initialize the distance map visualization
 */
function accessibility_map() {
  'use strict';

  /* increase timeouts for slow development server */
  r360.config.requestTimeout = 60000;

  /* load r360 color gradient */
  // TEXTURE_IMAGE.src = "img/mi-r360.png";

  /* leaflet map canvas */
  M = L.map('map', {
    minZoom:  5,
    maxZoom: 18,
    maxBounds: L.latLngBounds(L.latLng(49.6, 6.0), L.latLng(54.8, 20.4)),
    noWrap: true,
    continuousWorld: false,
    zoomControl: false
  });

  /* set viewport to berlin */
  M.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
  let whiteIcon = L.icon({
    iconUrl   : 'img/marker_source.svg',
    iconSize  : [28, 40],
    iconAnchor: [14, 40]
  });
  MARKER_ORIGIN_PRIMAR = L.marker([52.516285, 13.386181], {
    draggable: true,
    icon     : whiteIcon
  }).addTo(M);
  MARKER_ORIGIN_SECOND = L.marker([52.393616, 13.133086], {
    draggable: true,
    icon     : whiteIcon
  }).addTo(M);

  TILE_PARAMETERS_SHA1 = parametersSha1();

  /* setup leaflet canvas webgl overlay */
  O = L.canvasOverlay().drawing(drawGL(true)).addTo(M);
  C = O.canvas();
  O.canvas.width = C.clientWidth;
  O.canvas.height = C.clientHeight;

  /* initialize webgl on canvas overlay */
	var gl_Original = initWebGL(C);
	GL = WebGLDebugUtils.makeDebugContext(gl_Original);
  
  let   vShaderInit = document.getElementById("vShaderInit").text,
        fShaderFocus = document.getElementById("fShaderFocus").text,
        fShaderInit = document.getElementById("fShaderInit").text,
        vShaderQuad = document.getElementById("vShaderQuad").text,
        fShaderDebug = document.getElementById("fShaderDebug").text,
        vShaderCircle = document.getElementById("vShaderCircle").text,
        fShaderCircle = document.getElementById("fShaderCircle").text,
        fShaderVoronoi = document.getElementById("fShaderVoronoi").text,
        fShaderJFA = document.getElementById("fShaderJFA").text,
        fShaderFinal = document.getElementById("fShaderFinal").text;
	
  focusProgram = createProgram(GL, vShaderInit, fShaderFocus);
	initProgram = createProgram(GL, vShaderInit, fShaderInit);
	jfaProgram = createProgram(GL, vShaderQuad, fShaderJFA);
  circleProgram = createProgram(GL, vShaderCircle, fShaderCircle);
	voronoiProgram = createProgram(GL, vShaderQuad, fShaderVoronoi);
  finalProgram = createProgram(GL, vShaderQuad, fShaderFinal);
  debugProgram = createProgram(GL, vShaderQuad, fShaderDebug);
	
	if (!focusProgram) {
		console.log('Failed to intialize focusProgram.');
		return;
	}
  else if (!debugProgram){
    console.log('Failed to intialize debugProgram.');
    return;
  }
  else if (!initProgram){
    console.log('Failed to intialize initProgram.');
    return;
  }
  else if (!jfaProgram){
    console.log('Failed to intialize jfaProgram.');
    return;
  }
  else if (!circleProgram){
    console.log('Failed to intialize circleProgram.');
    return;
  }
  else if (!voronoiProgram){
    console.log('Failed to intialize voronoiProgram.');
    return;
  }
  else if (!finalProgram){
    console.log('Failed to intialize finalProgram.');
    return;
  }

	
  focusProgram.u_matrix = GL.getUniformLocation(focusProgram, "u_matrix");
  focusProgram.a_vertex = GL.getAttribLocation(focusProgram, "a_vertex");
  focusProgram.a_coord = GL.getAttribLocation(focusProgram, "a_coord");
  focusProgram.u_ColorRamp = GL.getUniformLocation(focusProgram, "u_ColorRamp");
  focusProgram.u_MaxTravelTime = GL.getUniformLocation(focusProgram, "u_MaxTravelTime");

	debugProgram.a_Position = GL.getAttribLocation(debugProgram, "a_Position");
	debugProgram.u_Sampler = GL.getUniformLocation(debugProgram, "u_Sampler");
	debugProgram.u_Resolution = GL.getUniformLocation(debugProgram, "u_Resolution");
	
  initProgram.u_matrix = GL.getUniformLocation(initProgram, "u_matrix");
  initProgram.a_vertex = GL.getAttribLocation(initProgram, "a_vertex");
  initProgram.a_coord = GL.getAttribLocation(initProgram, "a_coord");
  initProgram.u_Resolution = GL.getUniformLocation(initProgram, "u_Resolution");
  // initProgram.travelTime = GL.getUniformLocation(initProgram, "u_MaxTravelTime");
	
	jfaProgram.a_Position = GL.getAttribLocation(jfaProgram, "a_Position");
	jfaProgram.u_Sampler = GL.getUniformLocation(jfaProgram, "u_Sampler");
	jfaProgram.u_stepSize = GL.getUniformLocation(jfaProgram, "u_stepSize");
	jfaProgram.u_Resolution = GL.getUniformLocation(jfaProgram, "u_Resolution");

  circleProgram.a_coord = GL.getAttribLocation(circleProgram, "a_coord");
  circleProgram.u_matrix = GL.getUniformLocation(circleProgram, "u_matrix");
	
	voronoiProgram.a_Position = GL.getAttribLocation(voronoiProgram, "a_Position");
	voronoiProgram.u_ColorRamp = GL.getUniformLocation(voronoiProgram, "u_ColorRamp");
	voronoiProgram.u_JumpFloodTexture = GL.getUniformLocation(voronoiProgram, "u_JumpFloodTexture");
	voronoiProgram.u_Resolution = GL.getUniformLocation(voronoiProgram, "u_Resolution");
  // voronoiProgram.u_MaxTravelTime = GL.getUniformLocation(voronoiProgram, "u_MaxTravelTime");
  voronoiProgram.u_SliderParameter = GL.getUniformLocation(voronoiProgram, "u_SliderParameter");

  finalProgram.a_Position = GL.getAttribLocation(finalProgram, "a_Position");
  finalProgram.u_ContextTexture = GL.getUniformLocation(finalProgram, "u_ContextTexture");
  finalProgram.u_FocusTexture = GL.getUniformLocation(finalProgram, "u_FocusTexture");
  finalProgram.u_MaskTexture = GL.getUniformLocation(finalProgram, "u_MaskTexture");
  finalProgram.u_Resolution = GL.getUniformLocation(finalProgram, "u_Resolution");
  // finalProgram.u_SliderParameter = GL.getUniformLocation(finalProgram, "u_SliderParameter");
	
	if (debugProgram.a_Position < 0 || debugProgram.u_Sampler < 0 || debugProgram.u_Resolution < 0 ||
		jfaProgram.a_Position < 0 || jfaProgram.u_Sampler < 0 || jfaProgram.u_stepSize < 0 || jfaProgram.u_Resolution < 0 ||
		voronoiProgram.a_Position < 0 || voronoiProgram.u_ColorRamp < 0 || voronoiProgram.u_JumpFloodTexture < 0 || voronoiProgram.u_Resolution < 0 || voronoiProgram.u_MaxTravelTime < 0 || voronoiProgram.u_SliderParameter < 0 ||
		initProgram.uniformMatrix < 0 || initProgram.vertexPosition < 0 || initProgram.textureCoord < 0 || initProgram.u_Resolution < 0 || initProgram.travelTime < 0) {
		console.log('Failed to get attribute and uniform locations. Maybe the function does not know which shader program to use.');
		return false;
	}
	
	// FBO INITIALIZATION
	FBO = initFBO(GL);
	
	// TEXTURE INITIALIZATION
  focusTexture = initEmptyTexture(GL, C);
  contextTexture = initEmptyTexture(GL, C);
	readTexture = initEmptyTexture(GL, C);
	writeTexture = initEmptyTexture(GL, C);
  maskTexture = initEmptyTexture(GL, C);

  //* generate texture from color gradient */
  loadColorRamp(TEXTURE_IMAGE, function(){
    colorRamp = GL.createTexture();
    GL.bindTexture(GL.TEXTURE_2D, colorRamp);
    GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
    GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
    GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
    GL.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
    GL.texImage2D(GL.TEXTURE_2D, 0, GL.RGBA, GL.RGBA, GL.UNSIGNED_BYTE, TEXTURE_IMAGE);
    GL.bindTexture(GL.TEXTURE_2D, null);
  });


	// QUAD BUFFER FOR SCREEN-ALIGNED QUAD
  let quadVertices = new Float32Array([
      -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0
    ]);
  
  quadBuffer = GL.createBuffer();
  circleBuffer = GL.createBuffer();
  if (!quadBuffer || !circleBuffer) {
    console.log('Failed to create the buffer object');
    return null;
  }
  
  GL.bindBuffer(GL.ARRAY_BUFFER, quadBuffer);
  GL.bufferData(GL.ARRAY_BUFFER, quadVertices, GL.STATIC_DRAW);
  GL.bindBuffer(GL.ARRAY_BUFFER, null);

  initCircle();

  let attribution =
    '<a href="https://carto.com/location-data-services/basemaps/">CartoDB</a> | '
    + '<a href="https://developers.route360.net/index.html">Route360 API</a> | '
    + 'Rendering &copy; <a href="./LICENSE">Listemann, Schoedon</a>';
  L.tileLayer(
    'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
    {
      attribution: attribution,
      subdomains: 'abcd',
      maxZoom: 18
    }
  ).addTo(M);

  /* use a r360 time slider to adjust travel time */
  CONTROL_TIME = r360.travelTimeControl({
    travelTimes: [
      { time:  150 * 2, color: '#00341B' },
      { time:  300 * 2, color: '#004524' },
      { time:  450 * 2, color: '#00562D' },
      { time:  600 * 2, color: '#006837' },
      { time:  750 * 2, color: '#0E7B3B' },
      { time:  900 * 2, color: '#1C8E40' },
      { time: 1050 * 2, color: '#2AA145' },
      { time: 1200 * 2, color: '#39B54A' },
      { time: 1350 * 2, color: '#4DB947' },
      { time: 1500 * 2, color: '#62BD44' },
      { time: 1650 * 2, color: '#77C141' },
      { time: 1800 * 2, color: '#8CC63F' },
      { time: 1950 * 2, color: '#A6B936' },
      { time: 2100 * 2, color: '#C1AC2E' },
      { time: 2250 * 2, color: '#DC9F26' },
      { time: 2400 * 2, color: '#F7931E' },
      { time: 2550 * 2, color: '#F5841F' },
      { time: 2700 * 2, color: '#F47621' },
      { time: 2850 * 2, color: '#F26822' },
      { time: 3000 * 2, color: '#F15A24' },
      { time: 3150 * 2, color: '#E54D26' },
      { time: 3300 * 2, color: '#D94028' },
      { time: 3450 * 2, color: '#CD332A' },
      { time: 3600 * 2, color: '#C1272D' }
    ],
    unit      : ' min',
    position  : 'topright',
    label     : '',
    initValue : TRAVEL_TIME / 60
  });

  /* create webgl gltf tiles */
  GLTF_TILES = L.tileLayer.canvas({
    async:true,
    updateWhenIdle:true,
    reuseTiles:true
  });
  GLTF_TILES.drawTile = function(canvas, tile, zoom) {
    requestGltfTiles(tile, zoom, canvas);
  };
  GLTF_TILES.addTo(M);

  CONTROL_MEDIUM = r360.radioButtonControl({
    buttons: [
      {
        label: '<i class="fa fa-female"></i>  Walking',
        key: 'walk',
        tooltip: 'Walking speed is on average 5km/h',
        checked: false
      },
      {
        label: '<i class="fa fa-bicycle"></i> Cycling',
        key: 'bike',
        tooltip: 'Cycling speed is on average 15km/h',
        checked: true
      },
      {
        label: '<i class="fa fa-car"></i> Car',
        key: 'car',
        tooltip: 'Car speed is limited by speed limit',
        checked: false
      },
      {
        label: '<i class="fa fa-bus"></i> Transit',
        key: 'transit',
        tooltip: 'This contains public transportation',
        checked: false
      }
    ]
  });
  CONTROL_MEDIUM.addTo(M);
  CONTROL_MEDIUM.onChange(function(value){
    TRAVEL_MEDIUM = CONTROL_MEDIUM.getValue();
    TILE_PARAMETERS_SHA1 = parametersSha1();
    TILE_CACHE.resetHard();
    TILE_CACHE_NUM_REQU = 0;
    TILE_CACHE_NUM_RESP = 0;
    GLTF_TILES.redraw();
    drawGL();
  });
  CONTROL_MEDIUM.setPosition('topleft');

  CONTROL_OPERAND = r360.radioButtonControl({
    buttons: [
      {
        label: '&cup; Union',
        key: 'union',
        tooltip: 'No intersection shown',
        checked: true
      },
      {
        label: '&cap; Intersection',
        key: 'intersection',
        tooltip: 'Only intersected area shown.',
        checked: false
      },
      {
        label: '&#8960; Average',
        key: 'average',
        tooltip: 'Average travel time shown',
        checked: false
      },
    ]
  });
  CONTROL_OPERAND.addTo(M);
  CONTROL_OPERAND.onChange(function(value){
    TRAVEL_OPERAND = CONTROL_OPERAND.getValue();
    TILE_PARAMETERS_SHA1 = parametersSha1();
    TILE_CACHE.resetHard();
    TILE_CACHE_NUM_REQU = 0;
    TILE_CACHE_NUM_RESP = 0;
    GLTF_TILES.redraw();
    drawGL();
  });
  CONTROL_OPERAND.setPosition('bottomleft');

  MARKER_ORIGIN_PRIMAR.on('dragend', function(){
    TILE_PARAMETERS_SHA1 = parametersSha1();
    TILE_CACHE.resetHard();
    TILE_CACHE_NUM_REQU = 0;
    TILE_CACHE_NUM_RESP = 0;
    GLTF_TILES.redraw();
    drawGL();
  });

  MARKER_ORIGIN_SECOND.on('dragend', function(){
    TILE_PARAMETERS_SHA1 = parametersSha1();
    TILE_CACHE.resetHard();
    TILE_CACHE_NUM_REQU = 0;
    TILE_CACHE_NUM_RESP = 0;
    GLTF_TILES.redraw();
    drawGL();
  });

  /* redraw the scene after all tiles are loaded */
  GLTF_TILES.on('load', function(e) {
      drawGL();
  });

  /* update overlay on slider events */
  CONTROL_TIME.onSlideMove(function(values){
    TRAVEL_TIME = values[values.length - 1].time;
    // drawGL();
    drawVoronoi(TRAVEL_TIME);
  });
  CONTROL_TIME.onSlideStop(function(values){
    TRAVEL_TIME = values[values.length - 1].time;
    // drawGL();
    drawVoronoi(TRAVEL_TIME);
  });
  CONTROL_TIME.addTo(M);
  CONTROL_TIME.setPosition('topright');

  /* init cache for tile buffers for current zoom level */
  TILE_CACHE = L.tileBufferCollection(M.getZoom());

  /* reset tile buffer cache for each zoom level change */
  M.on('zoomend', function(e) {
    TILE_CACHE.resetOnZoom(M.getZoom());
    TILE_CACHE_NUM_REQU = 0;
    TILE_CACHE_NUM_RESP = 0;
    TRAVEL_DECIMAL_PLACES = M.getZoom();
    drawGL();
  });

  M.on('movestart', function(e) {
    drawGL();
  });

  M.on('move', function(e) {
    drawGL();
  });

  M.on('moveend', function(e) {
    drawGL();
  });

  L.control.zoom({ position: 'bottomright' }).addTo(M);

  // MATRIX SETUP
  const m4 = twgl.m4;
  const projection = m4.perspective(50 * Math.PI / 180, C.width / C.height, 1, 100);
  const camera = m4.lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
  const view = m4.inverse(camera);
  const viewProjection = m4.multiply(projection, view);
  const inverseViewProjection = m4.inverse(viewProjection); 
  // ----------------------------------

  C.addEventListener("mousemove", e => {
      const magicLens_checked = document.getElementById('magicLens').checked;

      if (magicLens_checked === true) {        
        /* mapping of canvas coordinates to webgl coordinates */
        var pos = getNoPaddingNoBorderCanvasRelativeMousePosition(e, C);
        const mousePositionX = pos.x / C.width * 2 - 1;
        const mousePositionY = pos.y / C.height * -2 + 1;

        // transform mouse coordinates to world space by the inverse view projection matrix
        const mouseWorldPos = m4.transformPoint(inverseViewProjection, [mousePositionX, mousePositionY, 0]);

        // add that world position to our matrix
        const matrix = m4.translate(viewProjection, mouseWorldPos);

        // DRAW CIRCLE INTO FBO ATTACHMENT
        drawCircle(matrix);

        finalDraw();
      }
  });
}

function drawMarkerLens(){
  const markerLens_checked = document.getElementById('magicLensMarker').checked;

  if (markerLens_checked === true){
    // MATRIX SETUP
    const m4 = twgl.m4;
    const projection = m4.perspective(50 * Math.PI / 180, C.width / C.height, 1, 100);
    const camera = m4.lookAt([0, 0, 5], [0, 0, 0], [0, 1, 0]);
    const view = m4.inverse(camera);
    const viewProjection = m4.multiply(projection, view);
    const inverseViewProjection = m4.inverse(viewProjection); 
    // ----------------------------------

    // FIRST MARKER
    var pixelCoordinates = M.latLngToLayerPoint(MARKER_ORIGIN_PRIMAR.getLatLng());
    console.log(pixelCoordinates);
    var pos = getRelativeMarkerPosition(pixelCoordinates, C);
    console.log(pos);
    var markerX = pos.x / C.width * 2 - 1;
    var markerY = pos.y / C.height * -2 + 1;
    console.log(markerX + " | " + markerY);
    var mouseWorldPos = m4.transformPoint(inverseViewProjection, [markerX, markerY, 0]);
    var matrix = m4.translate(viewProjection, mouseWorldPos);
    GL.useProgram(circleProgram);
    GL.bindFramebuffer(GL.FRAMEBUFFER, FBO);
    GL.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, maskTexture, 0);
    checkFBO(GL); 
    GL.clearColor(0.0, 0.0, 0.0, 0.0);
    GL.clear(GL.COLOR_BUFFER_BIT);
    GL.uniformMatrix4fv(circleProgram.u_matrix, false, matrix);
    GL.bindBuffer(GL.ARRAY_BUFFER, circleBuffer);
    GL.vertexAttribPointer(circleProgram.a_coord, 3, GL.FLOAT, false, 0, 0);
    GL.enableVertexAttribArray(circleProgram.a_coord);
    GL.drawArrays(GL.TRIANGLE_FAN, 0, numberOfVertices);

    // SECOND MARKER
    pixelCoordinates = M.latLngToLayerPoint(MARKER_ORIGIN_SECOND.getLatLng());
    console.log(pixelCoordinates);
    pos = getRelativeMarkerPosition(pixelCoordinates, C);
    markerX = pos.x / C.width * 2 - 1;
    markerY = pos.y / C.height * -2 + 1;
    console.log(markerX + " | " + markerY);
    mouseWorldPos = m4.transformPoint(inverseViewProjection, [markerX, markerY, 0]);
    matrix = m4.translate(viewProjection, mouseWorldPos);
    
    GL.uniformMatrix4fv(circleProgram.u_matrix, false, matrix);
    GL.drawArrays(GL.TRIANGLE_FAN, 0, numberOfVertices);
    GL.bindBuffer(GL.ARRAY_BUFFER, null);
    GL.bindFramebuffer(GL.FRAMEBUFFER, null);
    GL.useProgram(null);

    finalDraw();
  }
  else {
    drawTexture(contextTexture);
  }
}
function requestGltfTiles(tile, zoom, canvas) {
  'use strict';

  TILE_CACHE_NUM_REQU++;

  /* request tile from tiling server */
  requestTile(tile.x, tile.y, zoom, function(response){

    /* update status bar */
    TILE_CACHE_NUM_RESP++;
    let tc_perc = TILE_CACHE_NUM_RESP / TILE_CACHE_NUM_REQU * 100.0;
    document.getElementById("bar").innerHTML = statusBar(tc_perc);
    document.getElementById("perc").innerHTML = tc_perc.toFixed(2);

    const buffers = response.data.tile.gltf.buffers;

    /* measure transmission times if desired */
    if (MEASURE_TRANSMISSION) {
      window.console.timeEnd("0," + tile.x + "," + tile.y + "," + zoom);
      window.console.log(";;;" + (buffers.vertices.length/2.0) + ","
        + response.requestTime + "," + JSON.stringify(response).length);
    }

    /* proceed on valid responses */
    if (buffers.vertices.length > 0 &&
      buffers.indices.length > 0 &&
      response.id.localeCompare(TILE_PARAMETERS_SHA1) == 0) {

      /* create a tile buffer object for the current tile */
      let tileBuffer = L.tileBuffer(
        buffers.vertices,
        buffers.indices,
        buffers.times,
        {
          x: tile.x,
          y: tile.y,
          zoom: zoom
        }
      );

      /* make sanity check on the tile buffer cache */
      if (TILE_CACHE.getZoom() != zoom) {
        TILE_CACHE.resetOnZoom(zoom);
      }

      /* add tile buffer geometries to the collection */
      TILE_CACHE.updateTile(tileBuffer);

      /* redraw the scene */
      drawGL();
      GLTF_TILES.tileDrawn(canvas);
    }
  });
}

/**
 * Requests a tile from the r360 tiling server.
 *
 * @param (Integer) x the x coordinate of the tile
 * @param (Integer) y the y coordinate of the tile
 * @param (Integer) z the zoom factor of the tile
 * @param (Function) callback a callback processing the tile
 */
function requestTile(x, y, z, callback) {
  'use strict';

  let travelOptions = r360.travelOptions();
  travelOptions.setServiceKey('ZTOCBA4MNLQLQQPXHQDW');
  travelOptions.setServiceUrl('https://dev.route360.net/mobie/');
  travelOptions.addSource(MARKER_ORIGIN_PRIMAR);
  travelOptions.addSource(MARKER_ORIGIN_SECOND);
  travelOptions.setMaxRoutingTime(TRAVEL_MAX_ROUTING);
  travelOptions.setTravelType(TRAVEL_MEDIUM);
  travelOptions.setIntersectionMode(TRAVEL_OPERAND);
  travelOptions.setDate(TRAVEL_DATE);
  travelOptions.setTime(TRAVEL_DATE_TIME);
  travelOptions.setX(x);
  travelOptions.setY(y);
  travelOptions.setZ(z);
  travelOptions.setDecimalPlaces(TRAVEL_DECIMAL_PLACES);
  travelOptions.setEdgeClasses(TRAVEL_EDGE_CLASSES);

  if (MEASURE_TRANSMISSION) window.console.time("0," + x + "," + y + "," + z);

  r360.MobieService.getGraph(TILE_PARAMETERS_SHA1, travelOptions, callback);
}

/**
* draw all tiles from cache on the canvas overlay
*/
function drawGL() {
  'use strict';

  /* only proceed if context is available */
  if (GL) {
	  GL.useProgram(focusProgram);
    
  // 	const ext2 = GL.getExtension('WEBGL_draw_buffers') ||
  //                GL.getExtension('MOZ_WEBGL_draw_buffers');
  //   if (!ext2) {
  //     console.log("No extension 'WEBGL_draw_buffers'");
  //     return -1;
  //   }

      // CHANGE THE DRAWING DESTINATION TO FBO COLOR_ATTACHMENT
  	GL.bindFramebuffer(GL.FRAMEBUFFER, FBO);
  	GL.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, focusTexture, 0);	
    // GL.framebufferTexture2D(GL.FRAMEBUFFER, ext2.COLOR_ATTACHMENT1_WEBGL, GL.TEXTURE_2D, readTexture, 0);
  	checkFBO(GL);

    // ext2.drawBuffersWEBGL([
    //   ext2.COLOR_ATTACHMENT0_WEBGL, 
    //   ext2.COLOR_ATTACHMENT1_WEBGL
    // ]);

    /* enable blending */ //WOULD CAUSE MASSIVE ERRORS
    // GL.enable(GL.BLEND);
    // GL.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);

    /* disable depth testing */
    GL.disable(GL.DEPTH_TEST);

    /* clear color buffer for redraw */
    GL.clear(GL.COLOR_BUFFER_BIT);

    /* set view port to canvas size */
    GL.viewport(0, 0, C.width, C.height);

     /* get map bounds and top left corner used for webgl translation later */
    const bounds = M.getBounds();
    const topLeft = new L.LatLng(bounds.getNorth(), bounds.getWest());

    /* precalculate map scale, offset and line width */
    const zoom = M.getZoom();
    const scale = Math.pow(2, zoom) * 256.0;
    const offset = normalizeLatLon(topLeft.lat, topLeft.lng);
    const width = Math.max(zoom - 12.0, 1.0);

    /* define sizes of vertex and texture coordinate buffer objects */
    const vertexSize = 2;
    const texSize = 1;

    /* define model view matrix. here: identity */
    let uMatrix = new Float32Array([
      1,0,0,0,
      0,1,0,0,
      0,0,1,0,
      0,0,0,1
    ]);

    /* pass selected travel time to fragment shader */
    GL.uniform1f(focusProgram.u_MaxTravelTime, TRAVEL_TIME / 3600.0);

    /* translate to move [0,0] to top left corner */
    translateMatrix(uMatrix, -1, 1);

    /* scale based on canvas width and height */
    scaleMatrix(uMatrix, 2.0 / C.width, -2.0 / C.height);

    /* scale based on map zoom scale */
    scaleMatrix(uMatrix, scale, scale);

    /* translate offset to match current map position (lat/lon) */
    translateMatrix(uMatrix, -offset.x, -offset.y);

    /* set model view */
    GL.uniformMatrix4fv(focusProgram.u_matrix, false, uMatrix);

    /* adjust line width based on zoom */
    GL.lineWidth(width);

    let vertexCount = 0;
    let indexCount = 0;
    let drawCount = 0;

    GL.activeTexture(GL.TEXTURE0);
    GL.bindTexture(GL.TEXTURE_2D, colorRamp);
    GL.uniform1i(focusProgram.u_ColorRamp, 0);

    /* loop all tile buffers in cache and draw each geometry */
    const tileBuffers = TILE_CACHE.getTileBufferCollection();

    // DRAW LINES INTO ORIGIN TEXTURE
    for (let i = TILE_CACHE.getSize() - 1; i >= 0; i -= 1) {
      // console.log("TILE_CACHE.size: " + TILE_CACHE.getSize());
      /* only render tiles for current zoom level */
      if(tileBuffers[i].getZoom() == M.getZoom()) {

        vertexCount += tileBuffers[i].getVertexBuffer().length / 2.0;

        /* create vertex buffer */
        let vertexBuffer = GL.createBuffer();
        GL.bindBuffer(GL.ARRAY_BUFFER, vertexBuffer);
        GL.bufferData(
          GL.ARRAY_BUFFER,
          tileBuffers[i].getVertexBuffer(),
          GL.STATIC_DRAW
        );
        GL.enableVertexAttribArray(focusProgram.a_vertex);
        GL.vertexAttribPointer(
          focusProgram.a_vertex,
          vertexSize,
          GL.FLOAT,
          false,
          0,
          0
        );

        /* create texture coordinate buffer */
        let textureBuffer = GL.createBuffer();
        GL.bindBuffer(GL.ARRAY_BUFFER, textureBuffer);
        GL.bufferData(
          GL.ARRAY_BUFFER,
          tileBuffers[i].getColorBuffer(),
          GL.STATIC_DRAW
        );
        GL.enableVertexAttribArray(focusProgram.a_coord);
        GL.vertexAttribPointer(
          focusProgram.a_coord,
          texSize,
          GL.FLOAT,
          false,
          0,
          0
        );

        indexCount += tileBuffers[i].getIndexBuffer().length / 2.0;

        /* create index buffer */
        let indexBuffer = GL.createBuffer();
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, indexBuffer);

        /* draw geometry lines by indices */
        if (tileBuffers[i].getIndexBuffer().length > 65535) {
          /* use 32 bit extension */
          const ext = (
            GL.getExtension('OES_element_index_uint') ||
            GL.getExtension('MOZ_OES_element_index_uint') ||
            GL.getExtension('WEBKIT_OES_element_index_uint')
          );

          const buffer = new Uint32Array(tileBuffers[i].getIndexBuffer());
          GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, buffer, GL.STATIC_DRAW);
          GL.drawElements(
            GL.LINES,
            tileBuffers[i].getIndexBuffer().length,
            GL.UNSIGNED_INT,
            indexBuffer
          );
		  
        } else {

          /* fall back to webgl default 16 bit short */		  
          const buffer = new Uint16Array(tileBuffers[i].getIndexBuffer());
          GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, buffer, GL.STATIC_DRAW);
          GL.drawElements(
            GL.LINES,
            tileBuffers[i].getIndexBuffer().length,
            GL.UNSIGNED_SHORT,
            indexBuffer
          );
        }
      }
    }

    // UNBINDINGS
    GL.useProgram(null);
    GL.bindBuffer(GL.ARRAY_BUFFER, null);
    GL.bindTexture(GL.TEXTURE_2D, null);
    GL.bindFramebuffer(GL.FRAMEBUFFER, null);

    // ----------------------------DRAW LINES INTO READ TEXTURE----------------------------------------
    GL.useProgram(initProgram);

    // CHANGE THE DRAWING DESTINATION TO readTexture
    GL.bindFramebuffer(GL.FRAMEBUFFER, FBO);
    GL.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, readTexture, 0); 
    checkFBO(GL);

    /* clear color buffer for redraw */
    // SET CLEAR COLOR TO INVALID SEED COLOR
    GL.clearColor(0.0, 0.0, 1.0, 0.0);
    GL.clear(GL.COLOR_BUFFER_BIT);

    /* set view port to canvas size */
    GL.viewport(0, 0, C.width, C.height);

    GL.uniformMatrix4fv(initProgram.u_matrix, false, uMatrix);

    GL.uniform2f(initProgram.u_Resolution, C.width, C.height);

    // DRAW LINES
    for (let i = TILE_CACHE.getSize() - 1; i >= 0; i -= 1) {
      /* only render tiles for current zoom level */
      if(tileBuffers[i].getZoom() == M.getZoom()) {

        vertexCount += tileBuffers[i].getVertexBuffer().length / 2.0;

        /* create vertex buffer */
        let vertexBuffer = GL.createBuffer();
        GL.bindBuffer(GL.ARRAY_BUFFER, vertexBuffer);
        GL.bufferData(
          GL.ARRAY_BUFFER,
          tileBuffers[i].getVertexBuffer(),
          GL.STATIC_DRAW
        );
        GL.enableVertexAttribArray(initProgram.a_vertex);
        GL.vertexAttribPointer(
          initProgram.a_vertex,
          vertexSize,
          GL.FLOAT,
          false,
          0,
          0
        );

        /* create texture coordinate buffer */
        let textureBuffer = GL.createBuffer();
        GL.bindBuffer(GL.ARRAY_BUFFER, textureBuffer);
        GL.bufferData(
          GL.ARRAY_BUFFER,
          tileBuffers[i].getColorBuffer(),
          GL.STATIC_DRAW
        );
        GL.enableVertexAttribArray(initProgram.a_coord);
        GL.vertexAttribPointer(
          initProgram.a_coord,
          texSize,
          GL.FLOAT,
          false,
          0,
          0
        );

        indexCount += tileBuffers[i].getIndexBuffer().length / 2.0;

        /* create index buffer */
        let indexBuffer = GL.createBuffer();
        GL.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, indexBuffer);

        /* draw geometry lines by indices */
        if (tileBuffers[i].getIndexBuffer().length > 65535) {
          /* use 32 bit extension */
          const ext = (
            GL.getExtension('OES_element_index_uint') ||
            GL.getExtension('MOZ_OES_element_index_uint') ||
            GL.getExtension('WEBKIT_OES_element_index_uint')
          );

          const buffer = new Uint32Array(tileBuffers[i].getIndexBuffer());
          GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, buffer, GL.STATIC_DRAW);
          GL.drawElements(
            GL.LINES,
            tileBuffers[i].getIndexBuffer().length,
            GL.UNSIGNED_INT,
            indexBuffer
          );
      
        } else {

          /* fall back to webgl default 16 bit short */     
          const buffer = new Uint16Array(tileBuffers[i].getIndexBuffer());
          GL.bufferData(GL.ELEMENT_ARRAY_BUFFER, buffer, GL.STATIC_DRAW);
          GL.drawElements(
            GL.LINES,
            tileBuffers[i].getIndexBuffer().length,
            GL.UNSIGNED_SHORT,
            indexBuffer
          );
        }
      }
    }

    // UNBINDING
    GL.bindFramebuffer(GL.FRAMEBUFFER, null);
    GL.bindBuffer(GL.ARRAY_BUFFER, null);
    GL.bindTexture(GL.TEXTURE_2D, null);
    GL.useProgram(null);
	
  	let stepSize = nearestPow2(C.width) / 2;   // perhaps useful for OpenGL performance issues (see: https://bocoup.com/blog/find-the-closest-power-of-2-with-javascript)
  	
    // JUMP FLOODING
  	while (stepSize >= 1){
  		jumpFlood(stepSize);  			
  		swapTextures();
  		stepSize /= 2;
  	}

  	swapTextures();

    drawContext(TRAVEL_TIME);
    drawTexture(contextTexture);

  }
}

function nearestPow2( aSize ){
  return Math.pow( 2, Math.round( Math.log( aSize ) / Math.log( 2 ) ) ); 
}

function finalDraw(){
  GL.useProgram(finalProgram);
  
  GL.clearColor(0.0, 0.0, 0.0, 0.0);
  GL.clear(GL.COLOR_BUFFER_BIT);

  GL.bindBuffer(GL.ARRAY_BUFFER, quadBuffer);
  
  GL.vertexAttribPointer(finalProgram.a_Position, 2, GL.FLOAT, false, 0, 0);
  GL.enableVertexAttribArray(finalProgram.a_Position);

  GL.activeTexture(GL.TEXTURE0);
  GL.bindTexture(GL.TEXTURE_2D, contextTexture);

  GL.activeTexture(GL.TEXTURE1);
  GL.bindTexture(GL.TEXTURE_2D, focusTexture);

  GL.activeTexture(GL.TEXTURE2);
  GL.bindTexture(GL.TEXTURE_2D, maskTexture);

  // pass the uniforms
  GL.uniform1i(finalProgram.u_ContextTexture, 0);
  GL.uniform1i(finalProgram.u_FocusTexture, 1);
  GL.uniform1i(finalProgram.u_MaskTexture, 2);  
  GL.uniform2f(finalProgram.u_Resolution, C.width, C.height);
  // GL.uniform1f(finalProgram.u_SliderParameter, TRAVEL_TIME / 3600.0);

  // render textured quad
  GL.drawArrays(GL.TRIANGLE_STRIP, 0, 4); 

  GL.bindBuffer(GL.ARRAY_BUFFER, null);
  GL.bindTexture(GL.TEXTURE_2D, null);
  GL.useProgram(null);

}

function initCircle(){

  // DATA COMPUTATION
  
  circleVerticesX[0] = centerX;
  circleVerticesY[0] = centerY;
  circleVerticesZ[0] = centerZ;
  
  allCircleVertices.push(circleVerticesX[0]);
  allCircleVertices.push(circleVerticesY[0]);
  allCircleVertices.push(circleVerticesZ[0]);
  
  for (var i = 1; i < numberOfVertices; i++){
    circleVerticesX[i] = centerX + (radius * Math.cos(i * (2.0 * Math.PI) / numberOfTriangles));
    circleVerticesY[i] = centerY + (radius * Math.sin(i * (2.0 * Math.PI) / numberOfTriangles));
    circleVerticesZ[i] = centerZ;
    allCircleVertices.push(circleVerticesX[i]);
    allCircleVertices.push(circleVerticesY[i]);
    allCircleVertices.push(circleVerticesZ[i]);
  }
  
  var circleVertices = new Float32Array(allCircleVertices);
  
  GL.bindBuffer(GL.ARRAY_BUFFER, circleBuffer);
  GL.bufferData(GL.ARRAY_BUFFER, circleVertices, GL.STATIC_DRAW);
  GL.bindBuffer(GL.ARRAY_BUFFER, null);
}

function drawCircle(matrix){
  GL.useProgram(circleProgram);

  GL.bindFramebuffer(GL.FRAMEBUFFER, FBO);
  GL.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, maskTexture, 0);
  checkFBO(GL); 

  GL.clearColor(0.0, 0.0, 0.0, 0.0);
  GL.clear(GL.COLOR_BUFFER_BIT); 

  // UNIFORM MATRICES
  GL.uniformMatrix4fv(circleProgram.u_matrix, false, matrix);
  
  // BUFFER BINDING
  GL.bindBuffer(GL.ARRAY_BUFFER, circleBuffer);
  
  GL.vertexAttribPointer(circleProgram.a_coord, 3, GL.FLOAT, false, 0, 0);
  GL.enableVertexAttribArray(circleProgram.a_coord);
  
  // DRAW CALL
  GL.drawArrays(GL.TRIANGLE_FAN, 0, numberOfVertices);
  
  // UNBIND
  GL.bindBuffer(GL.ARRAY_BUFFER, null);
  GL.bindFramebuffer(GL.FRAMEBUFFER, null);
  GL.useProgram(null);

}

function jumpFlood(stepLength){
	
	GL.useProgram(jfaProgram);

	GL.bindFramebuffer(GL.FRAMEBUFFER, FBO);
	GL.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, writeTexture, 0);
	checkFBO(GL);
		
	GL.bindBuffer(GL.ARRAY_BUFFER, quadBuffer);
	
	GL.vertexAttribPointer(jfaProgram.a_Position, 2, GL.FLOAT, false, 0, 0);
	GL.enableVertexAttribArray(jfaProgram.a_Position);
	
	GL.activeTexture(GL.TEXTURE0);
	GL.bindTexture(GL.TEXTURE_2D, readTexture);

	GL.uniform1i(jfaProgram.u_Sampler, 0);				// passes the bound read texture from GL.TEXTURE0 unit to the sampler2D uniform
	GL.uniform1i(jfaProgram.u_stepSize, stepLength);
	GL.uniform2f(jfaProgram.u_Resolution, C.width, C.height);

	GL.drawArrays(GL.TRIANGLE_STRIP, 0, 4);

  GL.bindFramebuffer(GL.FRAMEBUFFER, null);
  GL.useProgram(null);
  GL.bindBuffer(GL.ARRAY_BUFFER, null);
  GL.bindTexture(GL.TEXTURE_2D, null);
}

function drawContext(sliderValue){

	GL.bindFramebuffer(GL.FRAMEBUFFER, FBO);
  GL.framebufferTexture2D(GL.FRAMEBUFFER, GL.COLOR_ATTACHMENT0, GL.TEXTURE_2D, contextTexture, 0);
  checkFBO(GL);
	
	GL.useProgram(voronoiProgram);
  
  GL.clearColor(0.0, 0.0, 0.0, 0.0);
  GL.clear(GL.COLOR_BUFFER_BIT);
	
	GL.bindBuffer(GL.ARRAY_BUFFER, quadBuffer);
	
	GL.vertexAttribPointer(voronoiProgram.a_Position, 2, GL.FLOAT, false, 0, 0);
	GL.enableVertexAttribArray(voronoiProgram.a_Position);

	GL.bindTexture(GL.TEXTURE_2D, colorRamp);

  // const texUnit = 5;
  GL.activeTexture(GL.TEXTURE0);
  GL.uniform1i(voronoiProgram.u_ColorRamp, 0);

	GL.activeTexture(GL.TEXTURE1);
	GL.bindTexture(GL.TEXTURE_2D, writeTexture);

	// pass the uniforms
	// GL.uniform1i(voronoiProgram.u_ColorRamp, 0);
	GL.uniform1i(voronoiProgram.u_JumpFloodTexture, 1);
	GL.uniform2f(voronoiProgram.u_Resolution, C.width, C.height);
  // GL.uniform1f(voronoiProgram.u_MaxTravelTime, TRAVEL_TIME / 3600.0);
  GL.uniform1f(voronoiProgram.u_SliderParameter, sliderValue / 3600.0);

	// render textured quad
	GL.drawArrays(GL.TRIANGLE_STRIP, 0, 4);	

  GL.bindFramebuffer(GL.FRAMEBUFFER, null);
  GL.bindBuffer(GL.ARRAY_BUFFER, null);
  GL.bindTexture(GL.TEXTURE_2D, null);
  GL.useProgram(null);
}

function drawTexture(texture) {
  GL.useProgram(debugProgram);

  GL.bindBuffer(GL.ARRAY_BUFFER, quadBuffer);

  GL.vertexAttribPointer(debugProgram.a_Position, 2, GL.FLOAT, false, 0, 0);
  GL.enableVertexAttribArray(debugProgram.a_Position);  

  // FRAGMENT SHADER STUFF
    // bind the texture to read from (corresponds to sampler2D object)
  GL.activeTexture(GL.TEXTURE0);
  GL.bindTexture(GL.TEXTURE_2D, texture);

    // pass the uniforms to the fragment shader program (must be in use)
  GL.uniform1i(debugProgram.u_Sampler, 0);
  GL.uniform2f(debugProgram.u_Resolution, C.width, C.height);
    
  // render textured quad
  GL.drawArrays(GL.TRIANGLE_STRIP, 0, 4);

  GL.bindBuffer(GL.ARRAY_BUFFER, null);
  GL.bindTexture(GL.TEXTURE_2D, null);
  GL.useProgram(null);
}

function swapTextures(){
	// no parameters passed because it must operate on the global textures
	const tmp = readTexture;
	readTexture = writeTexture;
	writeTexture = tmp;
}

/**
 *	CREATE FRAMEBUFFER OBJECT
 *	
 *	@param {WebGL_Rendering_Context} gl - WebGL context
*/
function initFBO(gl){

	// Create a frame buffer object (FBO)
	let framebuffer = gl.createFramebuffer();
	if (!framebuffer) {
		console.log('Failed to create frame buffer object');
		return null;
	}
	
	checkFBO(gl, framebuffer);
	
	return framebuffer;
}

/**
 *	CHECK IF FBO IS CONFIGURED CORRECTLY
 *
 *	@param {WebGL_Rendering_Context} gl - WebGL context
*/
function checkFBO(gl){
	let e = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
	if (gl.FRAMEBUFFER_COMPLETE !== e) {
		console.log('Frame buffer object is incomplete: ' + e.toString() + ": ");
		switch(e){
			case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
				console.log("INCOMPLETE_ATTACHMENT");
				break;
			case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
				console.log("INCOMPLETE_MISSING_ATTACHMENT");
				break;
			case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
				console.log("INCOMPLETE_DIMENSIONS");
				break;
			case gl.FRAMEBUFFER_UNSUPPORTED:
				console.log("UNSUPPORTED");
				break;
			default:
				console.log("NO MATCHING ERROR");
		}
		gl.deleteFramebuffer(FBO);
		console.log("Deleted FBO");
		return null;
	}
}

/** 
	CREATE EMPTY TEXTURE
*/
function initEmptyTexture(gl, canvas){
	const ext = gl.getExtension('OES_texture_float') ||
  				gl.getExtension('MOZ_OES_texture_float') ||
  				gl.getExtension('WEBKIT_OES_texture_float');
	if (!ext){
		console.log("Could not get OES_texture_float extension!");
		return null;
	}

	let texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, canvas.width, canvas.height, 0, gl.RGBA, gl.FLOAT, null);
	gl.bindTexture(gl.TEXTURE_2D, null);
	
	return texture;
}

function clearScreen(){
  GL.clearColor(0.0, 0.0, 0.0, 0.0);
  GL.clear(GL.COLOR_BUFFER_BIT);
}

/**
* helper: simple translation along x/y (2D)
*
* @param {Float32Array} matrix the output matrix to be translated
* @param {integer} x the translation factor along x
* @param {integer} y the translation factor along y
*/
function translateMatrix(matrix, x, y) {
  matrix[12] += matrix[0] * x + matrix[4] * y;
  matrix[13] += matrix[1] * x + matrix[5] * y;
  matrix[14] += matrix[2] * x + matrix[6] * y;
  matrix[15] += matrix[3] * x + matrix[7] * y;
}

/**
* helper: simple scaling along x/y (2D)
*
* @param {Float32Array} matrix the output matrix to be scaled
* @param {integer} x the scaling factor along x
* @param {integer} y the scaling factor along y
*/
function scaleMatrix(matrix, x, y) {
  matrix[0] *= x;
  matrix[1] *= x;
  matrix[2] *= x;
  matrix[3] *= x;
  matrix[4] *= y;
  matrix[5] *= y;
  matrix[6] *= y;
  matrix[7] *= y;
}

/**
 * Converts latitude/longitude to Normalized Mercator coordinates
 * for equator size of 1.0 and inverts the y axis (from EPSG:4326)
 *
 * @param {float} lat Latitude coordinate in EPSG:4326
 * @param {float} lon Longitude coordinate in EPSG:4326
 * @return {L.point} Leaflet point with tile normalized x and y coordinates
 */
function normalizeLatLon(lat, lon) {
  let l = Math.sin(lat * Math.PI / 180.0);
  let x = ((lon + 180) / 360);
  let y = (0.5 - Math.log((1 + l) / (1 - l)) / (Math.PI * 4));
  return L.point(x, y);
}

function parametersSha1() {
  TILE_PARAMETERS.maxRouting = TRAVEL_MAX_ROUTING;
  /* TILE_PARAMETERS.date = TRAVEL_DATE; */
  /* TILE_PARAMETERS.dateTime = TRAVEL_DATE_TIME; */
  /* TILE_PARAMETERS.decimal = TRAVEL_DECIMAL_PLACES; */
  TILE_PARAMETERS.classes = TRAVEL_EDGE_CLASSES;
  TILE_PARAMETERS.medium = TRAVEL_MEDIUM;
  TILE_PARAMETERS.operand = TRAVEL_OPERAND;
  TILE_PARAMETERS.markers = new Array(2);
  TILE_PARAMETERS.markers[0] = MARKER_ORIGIN_PRIMAR.getLatLng();
  TILE_PARAMETERS.markers[1] = MARKER_ORIGIN_SECOND.getLatLng();
  return Sha1.hash(JSON.stringify(TILE_PARAMETERS));
}

/**
* helper: format big numbers in compact format
*
* @param {float} num the number to format
* @param {integer} digits the decimal points to use
* @return {String} the formatted compact number
*/
function nFormatter(num, digits) {
  let si = [
    { value: 1E18, symbol: "E" },
    { value: 1E15, symbol: "P" },
    { value: 1E12, symbol: "T" },
    { value: 1E9,  symbol: "G" },
    { value: 1E6,  symbol: "M" },
    { value: 1E3,  symbol: "k" }
  ], rx = /\.0+$|(\.[0-9]*[1-9])0+$/, i;
  for (i = 0; i < si.length; i++) {
    if (num >= si[i].value) {
      return (num / si[i].value).toFixed(digits).replace(rx, "$1")
        + si[i].symbol;
    }
  }
  return num.toFixed(digits).replace(rx, "$1");
}

/**
* helper: format a status bar based on status percent
*
* @param {float} perc the status
* @return {String} the formatted status bar
*/
function statusBar(perc) {
  if (perc < 10)
    return "----------";
  if (perc < 20)
    return "|---------";
  if (perc < 30)
    return "||--------";
  if (perc < 40)
    return "|||-------";
  if (perc < 50)
    return "||||------";
  if (perc < 60)
    return "|||||-----";
  if (perc < 70)
    return "||||||----";
  if (perc < 80)
    return "|||||||---";
  if (perc < 90)
    return "||||||||--";
  if (perc < 100)
    return "|||||||||-";

  return "||||||||||";
}

/**
* log to console with timestamps
*
* @param {string} s the string to log
*/
function _log(s) {
  let n = new Date().getTime() / 1000.0;
  window.console.log('[' + n.toFixed(3) + '] ' + s);
}

function getRelativeMousePosition(evento, target) {
  target = target || evento.target;
  var rect = target.getBoundingClientRect();

  return {
    x: evento.clientX - rect.left,
    y: evento.clientY - rect.top,
  }
}

// assumes target or event.target is canvas
function getNoPaddingNoBorderCanvasRelativeMousePosition(ev, target) {
  target = target || ev.target;
  var pos = getRelativeMousePosition(ev, target);

  pos.x = pos.x * target.width  / target.clientWidth;
  pos.y = pos.y * target.height / target.clientHeight;

  return pos;  
}

function getRelativeMarkerPosition(markerPos, target){
  var rect = target.getBoundingClientRect();

  var pos = {x: null, y: null};
  pos.x = (markerPos.x - rect.left) * target.width / target.clientWidth;
  pos.y = (markerPos.y - rect.top) * target.height / target.clientHeight;

  return pos;
}
