'use strict';

var pluscolor = new Uint8ClampedArray([0,128,255,255]);
var minuscolor = new Uint8ClampedArray([255,64,64,255]);

var xsize = 500, ysize = 500;
var canvas = document.getElementById('field');
canvas.width = xsize;
canvas.height = ysize;
var ctx = canvas.getContext('2d');
var img = ctx.createImageData(xsize, ysize);


var room_size_m = 25;
var dB_max = 30, dB_min = -60;
var wavelength_m = 3e8 / 2.4e9;


function pointSource(x0, y0, phase0, power_1m) {
  var areabuf = new ArrayBuffer(4 * xsize * ysize);
  var area = new Float32Array(areabuf);
  
  x0 *= xsize;
  y0 *= ysize;

  for (var i = 0; i < area.length; i++) {
    var y = i / xsize;
    var x = i % xsize;
    var dy = (y - y0) * room_size_m / xsize;
    var dx = (x - x0) * room_size_m / ysize;
    var r = Math.sqrt(dy*dy + dx*dx);
    var phase = (phase0 + r / wavelength_m) % (2 * Math.PI);
    area[i] = power_1m / (r * r);
    // FIXME store the actual phase
    if (phase > Math.PI) area[i] = -area[i];
  }
  return area;
}


// TODO: this is WRONG!  Must properly add using phases.
function addAreas(areas) {
  var areabuf = new ArrayBuffer(4 * xsize * ysize);
  var area = new Float32Array(areabuf);

  for (var ai = 0; ai < areas.length; ai++) {
    var a = areas[ai];
    for (var i = 0; i < a.length; i++) {
      area[i] += a[i];
    }
  }
  return area;
}


function setPix(img, i, val) {
  if (val >= 0) {
    var c = pluscolor;
    var dB = 10*Math.log(val, 10);
  } else {
    var c = minuscolor;
    var dB = 10*Math.log(-val, 10);
  }
  var scale = (dB - dB_min) / (dB_max - dB_min);
  if (scale < 0) scale = 0;
  for (var j = 0; j < 3; j++) {
    img.data[4*i + j] = c[j] * scale;
  }
  img.data[4*i + 3] = 255;
}


var cx = 0.3, cy = 0.4;
var a1 = pointSource(0.3, 0.3, 0, 1);

function render() {
  var a2 = pointSource(cx, cy, Math.PI, 1);
  var area = addAreas([a1, a2]);

  for (var i = 0; i < area.length; i++) {
    setPix(img, i, area[i]);
  }
  ctx.putImageData(img, 0, 0);
}

render();
var rendering = 0;

canvas.onmousemove = function(e) {
  if (rendering) {
    console.debug(e);
    cx = e.x / canvas.clientWidth;
    cy = e.y / canvas.clientHeight;
    render();
  }
}

canvas.onmousedown = function(e) {
  rendering = 1;
  canvas.onmousemove(e);
}

canvas.onmouseup = function(e) {
  rendering = 0;
}

