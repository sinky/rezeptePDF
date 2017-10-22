var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var _ = require('underscore');
var request = require('request');
var cheerio = require("cheerio");
var async = require("async");

var rezepteUrl = 'https://my-azur.de/brain/rezepte/start';
var rezeptePDFPath = path.join(__dirname, 'rezepte.pdf');

var queueWorkers = 10;
var workDir = path.join(__dirname, 'tmp');

/*
 * queue
*/
var queue = async.queue(saveUrlToPDF, queueWorkers);
queue.drain = function() {
  console.log('all items have been processed');
  mergePDFs();
}


/*
 * Create Workdir
*/
try {
  fs.statSync(workDir);
}catch(e) {
  fs.mkdirSync(workDir);
}


/*
 * Get Rezept Page URLs from Rezepte Mainpage
*/
request(rezepteUrl, function (error, response, html) {
  if (!error && response.statusCode == 200) {
    console.log('loaded', rezepteUrl, 'with status code', 200);

    var $ = cheerio.load(html);
    var $a = $('.content ul.filter').find('a');

    console.log('found', $a.length, '"a" elements. first url is', $a.first().attr('href'));
    
    if($a.length < 1) {
      console.error('no urls found');
      return false;
    }

    $a.each(function(index, value) {
      var url = $(this).attr('href');
      queue.push({
        id: index,
        url: url
      }, function (err) {
        console.log('finished', url);
      });
    });

  }else{
    console.error('error', error, response);
  }
});

/*
 * Worker
*/
function saveUrlToPDF(data, callback) {
  var id = pad(data.id + 1, 3);
  var url = data.url;
  var fileName = path.join(workDir, id + '_' + url.split('/').pop() + '.pdf');

  console.log('saving', id, url);

  var command = [
    '"' + path.join(__dirname, 'bin', 'wkhtmltopdf.exe') + '"',
    '--quiet',
    '--disable-smart-shrinking',
    '--print-media-type',
    '--header-center', '""',
    '--header-font-size', '10',
    '--footer-center', '"[title]"',
    '--footer-right', '"[page]/[topage]"',
    '--footer-font-size', '10',
    url,
    '"' + fileName + '"'
  ].join(' ');
  
  var child = exec(command);

  child.stdout.on('data', function(data) {
    //console.log('stdout: ' + data);
  });
  child.stderr.on('data', function(data) {
    if(data.indexOf('QFont::setPixelSize: Pixel size') != -1) { return; }
    console.log(data);
  });
  child.on('close', function(code) {
    return callback();
  });
}

function mergePDFs() {
  console.log('merging PDFs to rezept.pdf');

  var fileName = path.join(workDir, '_rezepte.pdf');

  var command = [
    '"' + path.join(__dirname, 'bin', 'pdftk.exe') + '"',
    '"' + path.join(workDir, '*.pdf') + '"',
    'cat',
    'output',
    '"' + rezeptePDFPath + '"'
  ].join(' ');

  var child = exec(command);

  child.stdout.on('data', function(data) {
    //console.log('stdout: ' + data);
  });
  child.stderr.on('data', function(data) {
    console.log(data);
  });
  child.on('close', function(code) {
    console.log('rezepte.pdf done');
    exec(rezeptePDFPath);
  });
}

function pad(num, size) {
  var s = num + '';
  while (s.length < size) s = '0' + s;
  return s;
}