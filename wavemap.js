'use strict';

var pluscolor = new Uint8ClampedArray([0,128,255,255]);
var minuscolor = new Uint8ClampedArray([255,64,64,255]);
var blackcolor = new Uint8ClampedArray([0,0,0,255]);


var xsize = 1000, ysize = 1000;
var canvas = document.getElementById('field');

canvas.width = xsize;
canvas.height = ysize;
var ctx = canvas.getContext('2d');
var img = ctx.createImageData(xsize, ysize);

var areabuf = new ArrayBuffer(4 * xsize * ysize);
var area = new Float32Array(areabuf);

for (var i = 0; i < area.length; i++) {
  area[i] = Math.sin(i/xsize*10.005 * 2 * Math.PI);
}

function setPix(img, val) {
  if (val >= 0) {
    var c = pluscolor;
  } else {
    var c = minuscolor;
    val = -val;
  }
  for (var j = 0; j < 3; j++) {
    img.data[4*i + j] = c[j] * val;
  }
  img.data[4*i + 3] = 255;
}

for (var i = 0; i < area.length; i++) {
  setPix(img, area[i]);
}

ctx.putImageData(img, 0, 0);
