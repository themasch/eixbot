'use strict';
const TelegramBot = require('node-telegram-bot-api');
const execFile = require('child_process').execFile
const xml2js = require('xml2js')
const _ = require('lodash')

var token = require('./config.json').token;
// Setup polling way
var bot = new TelegramBot(token, {polling: true});

// Matches /echo [whatever]
bot.onText(/\/echo (.+)/, function (msg, match) {
  var fromId = msg.from.id;
  var resp = match[1];
  bot.sendMessage(fromId, resp);
});

bot.on('chosen_inline_result', (msg) => {
  console.log('chosen', msg);
})

function parseResult(eixml) {
  if(!eixml) {
    return [];
  }
  let packages = [];
  eixml.eixdump.category.forEach((category) => {
    let category_name = category.$.name;
    category.package.forEach((pack) => {
      let package_name = pack.$.name;
      let description = pack.description.join("\n");
      let name = category_name + '/' + package_name;
      let packa = {
        category: category_name,
        name: package_name,
        display_name: name,
        description:description,
        homepage: pack.homepage.join(''),
        versions: [],
        uses: []
      };
      pack.version.forEach((version) => {
        let slot =version.$.slot ? ('(' + version.$.slot + ')') : ''
        packa.versions.push((version.$.id + slot).replace(/_/g, '\\_').replace(/\*/g, '\\*'));

        let use = [];
        if (version.iuse) {
          version.iuse.forEach(function(iuse) {
            if (typeof iuse === 'string') {
              use = use.concat(iuse.split(' ').map(str => str.replace(/_/g, '\\_').replace(/\*/g, '\\*')));
              return;
            }

            use.push('*' + iuse._.replace(/_/g, '\\_').replace(/\*/g, '\\*') + '*');
          });
        }

        packa.uses = packa.uses.concat(use);
      })
      packa.uses = _.uniq(packa.uses);

      packages.push(packa)
    })
  })

  return packages;
}

function formatResult(result) {
  return result.map(row => {
    let url = 'https://packages.gentoo.org/packages/' + row.display_name;
    let name = row.display_name;
    let answer = {
      input_message_content: {
        message_text: '*' + name + '*' + "\n" +
          row.description + "\n" +
          'version: ' + row.versions.join(', ') +"\n"+
          (row.uses.length ? ('uses: ' + row.uses.join(', ') +"\n") : '' ) +
          '[homepage](' + row.homepage + ') | [package info](' + url + ')',
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      },
      cache_time: 10,
      type: 'article',
      id: name,
      title: name,
      description: row.description,
      thumb_width: 1,
      thumb_height: 1,
      url: url,
      hide_url: true
    };
    return answer;
  });
}

bot.on('inline_query', (msg) => {
  let qry = msg.query;
  console.log('Query: %s', msg.query);
  if (qry.length < 2) {
    return bot.answerInlineQuery(msg.id, [])
  }
  execFile('eix', ['--xml', qry ],{maxBuffer: 1024 * 1024}, (err, out, code) => {
    xml2js.parseString(out, (err, xml) => {
      if (!xml) {
        console.error(out);
      }
      let result = parseResult(xml)
      let answer = formatResult(result)
      return bot.answerInlineQuery(msg.id, answer)
    });
  });
})
