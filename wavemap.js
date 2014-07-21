'use strict';

var pluscolor = new Uint8ClampedArray([0,128,255,255]);
var minuscolor = new Uint8ClampedArray([255,64,64,255]);

var xsize = 200, ysize = 200;
var canvas = document.getElementById('field');
canvas.width = xsize;
canvas.height = ysize;
var ctx = canvas.getContext('2d');
var img = ctx.createImageData(xsize, ysize);


var room_size_m = 25;
var dB_max = 30, dB_min = -60;
var wavelength_m = 3e8 / 2.4e9;


function pointSource(x0, y0, phase0, power_1m) {
  var buf = new ArrayBuffer(2 * 4 * xsize * ysize);
  var gains = new Float32Array(buf, 0, xsize * ysize);
  var phases = new Float32Array(buf, 4 * xsize * ysize);
  
  x0 *= xsize;
  y0 *= ysize;

  for (var i = 0; i < gains.length; i++) {
    var y = i / xsize;
    var x = i % xsize;
    var dy = (y - y0) * room_size_m / xsize;
    var dx = (x - x0) * room_size_m / ysize;
    var r = Math.sqrt(dy*dy + dx*dx);
    phases[i] = (phase0 + r / wavelength_m) % (2 * Math.PI);
    gains[i] = power_1m / (r * r);
  }
  return { gains: gains, phases: phases };
}


function addAreas(areas) {
  var buf = new ArrayBuffer(2 * 4 * xsize * ysize);
  var gains = new Float32Array(buf, 0, xsize * ysize);
  var phases = new Float32Array(buf, 4 * xsize * ysize);

  for (var ai = 0; ai < areas.length; ai++) {
    var a = areas[ai];
    for (var i = 0; i < a.gains.length; i++) {
      var x = gains[i]*Math.cos(phases[i]) + a.gains[i]*Math.cos(a.phases[i]);
      var y = gains[i]*Math.sin(phases[i]) + a.gains[i]*Math.sin(a.phases[i]);
      gains[i] = Math.sqrt(x*x + y*y);
      phases[i] = Math.atan2(y, x);
      if (phases[i] < 0) phases[i] += 2 * Math.PI;
    }
  }
  return { gains: gains, phases: phases };
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


var a1 = pointSource(0.3, 0.3, 0, 1);
var a2;
var cx = 0.3, cy = 0.3 + wavelength_m/room_size_m*10/2;
var area;

function render() {
  a2 = pointSource(cx, cy, Math.PI, 1);
  area = addAreas([a1, a2]);

  for (var i = 0; i < area.gains.length; i++) {
    var sgn = area.phases[i] > Math.PI ? -1 : 1;
    setPix(img, i, area.gains[i] * sgn);
  }
  ctx.putImageData(img, 0, 0);
}

render();
var rendering = 0;

canvas.onmousemove = function(e) {
  if (rendering) {
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

