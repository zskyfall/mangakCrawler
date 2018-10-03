var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cheerio = require('cheerio');
var request = require('async-request');
var rp = require('request-promise');
var mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate');

//connect mongoose db
mongoose.connect('mongodb://localhost/mangakCrawler', { useNewUrlParser: true });
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'Lỗi kết nối csdl:'));
db.once('open', function() {
  console.log('Kết nối dbs thành công!')
});

//MongoDB Schema
var mangaSchema = mongoose.Schema({
	title: String,
  name: String,
	author: [],
	category: [],
	status: String,
	view: Number,
  isCrawled: {
    type: Boolean,
    default: false
  },
	update: String,
  updateISO: Date,
	cover: String,
	link: String,
	description: String
});

var chapterSchema = mongoose.Schema({
	link: String,
  number: Number,
  update: String,
	title: String,
	images: [],
	manga :{
		id: String,
		title: String
	}
});

mangaSchema.plugin(mongoosePaginate);

var Manga = mongoose.model('Manga', mangaSchema);
var Chapter = mongoose.model('Chapter', chapterSchema);

const webdriver = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

//ROUTER GET
app.get('/', async function(req, res) {
	let mangaLink = 'http://mangak.info/dragon-ball-x-onepunch-man/';

	let $ = cheerio.load(await getRawBody(mangaLink));
	let title = $('.entry-title').text();
	let author = $('.truyen_info_right > li:nth-child(2) > a:nth-child(2)').text();
	let status = $('.truyen_info_right > li:nth-child(4) > a:nth-child(2)').text();
	let update = $('.truyen_info_right > li:nth-child(6)').text();
      update = update.slice(update.indexOf("Nhật :") + 6, update.length).trim();

	let view = $('.truyen_info_right > li:nth-child(7)').text();
      view = view.slice(view.indexOf('Lượt Xem :') + 10, view.length).trim();
      view = view.replace(',','');
      view = parseInt(view);
	let cover = $('.info_image > img:nth-child(1)').attr('src');
	let description = $('.entry-content').text();
	let listCategory = [];

	$('.truyen_info_right > li:nth-child(3) > a').each(function(index) {
		let category = $(this).text();
			listCategory.push(category);
	});

	let count;
	try {
		count = await Manga.count({title: title, link: mangaLink});
	}
	catch(e) {
		console.log(e);
	}

	if(count == 1) {
		let manga;
		try {
			manga = await Manga.findOne({title: title, link: mangaLink});
		}
		catch(e) {
			console.log(e);
		}

		$('.chapter-list > div.row span a').each(async function(index) {
			let chapterUrl = $(this).attr('href');
			let chapterTitle = $(this).text();
      let chapterNumber = chapterTitle.slice(chapterTitle.indexOf("chap ") + 4, chapterTitle.length).trim();
          chapterNumber = parseFloat(chapterNumber);

      let chapterCount;
      try {
        chapterCount = await Chapter.count({'manga.id': manga._id, number: chapterNumber});
      }
      catch(e) {
        console.log(e);
      }

      if(chapterCount < 1) {
        let chapter = new Chapter({
          link: chapterUrl,
          title: chapterTitle,
          number: chapterNumber,
          manga: {
            id: manga._id,
            title: manga.title
          }
        });

        await chapter.save();
      }

      console.log("Da luu: " + chapterTitle);
		});

		res.json(manga);
	}
	else {
		let manga = new Manga({
			title: title,
			author: author,
			status: status,
			update: update,
			view: view,
			cover: cover,
			link: mangaLink,
			category: listCategory,
			description: description
		});

		let newManga;
		try{
			newManga = await manga.save();
		}
		catch(e) {
			console.log(e);
		}
		res.send(newManga);
	}

});

app.get('/crawl', async function(req, res) {

	let driver = new webdriver.Builder()
	    .forBrowser('firefox')
	    .setChromeOptions(/* ... */)
	    .setFirefoxOptions(/* ... */)
	    .build();

	let mangaId = "5bb0ff1ca476d605aff7f65e";

	let listChapters;
	try {
		listChapters = await Chapter.find({'manga.id': mangaId});
	}
	catch(e) {
		console.log(e);
	}

	for(var i = 0; i < listChapters.length; i++) {
		let chapter = listChapters[i];
		let images = [];

		await driver.get(chapter.link)
	    .then(() => driver.getPageSource())
	    .then((source) => {
	        const $ = cheerio.load(source);

	        $('.vung_doc > img').each(async function(index) {
	        	let src = await $(this).attr('src');
	        	//console.log(src);
	        	images.push(src);
	        });
	    });

	    Chapter.updateOne({'manga.id': mangaId, title: chapter.title}, {images: images}, function(err) {
	    	if(!err) {
	    		console.log("ok: " + chapter.title);
	    	}
	    	else {
	    		console.log(err);
	    	}
	    });
	}
	res.send("Da hoa tat");
});

app.get('/list-manga', async function(req, res) {
    var url = 'http://www.nettruyen.com/hot?page=1';

    let listMangas = [];
    let response;
    try {
        response = await getRawBody(url);
    }
    catch(e) {
      res.json({error: e});
    }

    let $ = cheerio.load(response);

    let lastPage = $('.pagination > li:last-child > a:nth-child(1)').attr('href');
        lastPage = lastPage.slice(lastPage.indexOf('=') + 1, lastPage.length);
        lastPage = parseInt(lastPage);

    $('div.items .clearfix figcaption h3 a.jtip').each(async function(index) {
        let href = $(this).attr('href');
        let title = $(this).text();
        //listMangas.push(href);
        var currentdate = new Date();
        var datetime = currentdate.getDate() + "/"
                + (currentdate.getMonth()+1)  + "/"
                + currentdate.getFullYear() + "  "
                + currentdate.getHours() + ":"
                + currentdate.getMinutes() + ":"
                + currentdate.getSeconds();
        //console.log(datetime);
        try {
            let newCrawl = new ListCrawl({
                url: href,
                isCrawled: false,
                update: datetime,
                updateISO: currentdate
            });

            await newCrawl.save();
        }
        catch(e) {
            console.log(e);
        }
    });

    for(var i = 2; i < lastPage ; i++) {
        let link = 'http://www.nettruyen.com/hot?page=' + i;
        let response;
        try {
            response = await getRawBody(link);
        }
        catch(e) {
          res.json({error: e});
        }

        let $$ = cheerio.load(response);

        let lastPage = $$('.pagination > li:last-child > a:nth-child(1)').attr('href');
            lastPage = lastPage.slice(lastPage.indexOf('=') + 1, lastPage.length);
            lastPage = parseInt(lastPage);

        $$('div.items .clearfix figcaption h3 a.jtip').each(async function(index) {
            let href = $$(this).attr('href');
            let title = $$(this).text();
            var currentdate = new Date();
            var datetime = currentdate.getDate() + "/"
                    + (currentdate.getMonth()+1)  + "/"
                    + currentdate.getFullYear() + "  "
                    + currentdate.getHours() + ":"
                    + currentdate.getMinutes() + ":"
                    + currentdate.getSeconds();
            try {
                let newCrawl = new ListCrawl({
                    url: href,
                    isCrawled: false,
                    update: datetime,
                    updateISO: currentdate
                });

                await newCrawl.save();
            }
            catch(e) {
                console.log(e);
            }

        });
    }
    res.send("done");
});


app.get('/fetch-list-manga',async function(req, res) {
  var url = 'http://www.nettruyen.com/hot?page=1';

  let listMangas = [];
  let response;
  try {
      response = await getRawBody(url);
  }
  catch(e) {
    res.json({error: e});
  }

  let $ = cheerio.load(response);

  let lastPage = $('.pagination > li:last-child > a:nth-child(1)').attr('href');
      lastPage = lastPage.slice(lastPage.indexOf('=') + 1, lastPage.length);
      lastPage = parseInt(lastPage);

  $('div.items .clearfix figcaption h3 a.jtip').each(async function(index) {
      let href = $(this).attr('href');
      let title = $(this).text();
      try {
          let newManga = new Manga({
              title: title,
              link: href
          });

          await newManga.save();
      }
      catch(e) {
          console.log(e);
      }
  });

  for(var i = 2; i < lastPage ; i++) {
      let link = 'http://www.nettruyen.com/hot?page=' + i;
      let response;
      try {
          response = await getRawBody(link);
      }
      catch(e) {
        res.json({error: e});
      }

      let $$ = cheerio.load(response);

      let lastPage = $$('.pagination > li:last-child > a:nth-child(1)').attr('href');
          lastPage = lastPage.slice(lastPage.indexOf('=') + 1, lastPage.length);
          lastPage = parseInt(lastPage);

      $$('div.items .clearfix figcaption h3 a.jtip').each(async function(index) {
          let href = $$(this).attr('href');
          let title = $$(this).text();
          try {
            let newManga = new Manga({
                title: title,
                link: href
            });

            await newManga.save();
          }
          catch(e) {
              console.log(e);
          }

      });
  }
  res.send("done");
});

app.get('/list-crawl/:number', async function(req, res) {
    let number = req.params.number || 1;
        number = parseInt(number);

    console.log(number);

    if(number < 3) {
      Manga.paginate({}, { page: number, limit: 1, select: 'link' }, async function(err, result) {
            if(!err) {
                let url = await result.docs[0].link;
                console.log(url);
                await fetchManga(url);
                try {
                    //await ListCrawl.updateOne({url: url}, {isCrawled: true});
                    number = number + 1;
                    res.redirect('/list-crawl/' + number);
                }
                catch(e) {
                  console.log(e);
                }
            }
            else {
              console.log(err);
            }
      });
    }
    else {
      res.send("qua gioi han");
    }
    //res.send(list);
});

var fetchManga = async function (mangaLink) {
  console.log("Crawling : " + mangaLink + "...");

  //Bóc tách thông tin
  let $ = cheerio.load(await getRawBody(mangaLink));
  let title = $('.title-detail').text();
  let name = $('h2.other-name').text() || title;
  let listAuthor = [];

  $('li.author > p:nth-child(2) a').each(function(index) {
      let author = $(this).text();
      listAuthor.push(author);
  });

  let status = $('.status > p:nth-child(2)').text();
  let update = $('time.small').text();
      update = update.slice(update.indexOf("lúc:") + 4, update.length).trim();
      update = update.replace(']','');
  let tempUpdate = update;
  let hour = update.slice(0,tempUpdate.indexOf(':')).trim();
      hour = parseInt(hour);
      tempUpdate = tempUpdate.slice(tempUpdate.indexOf(':') + 1, tempUpdate.length);
  let minute = tempUpdate.slice(0, tempUpdate.indexOf(' '));
      minute = parseInt(minute);

      tempUpdate = tempUpdate.slice(tempUpdate.indexOf(' '), tempUpdate.length).trim(); //Ket qua duoc ngay thang nam
      tempUpdate = tempUpdate.split('/');
  let day = tempUpdate[0];
      day = parseInt(day);
  let month = tempUpdate[1];
      month = parseInt(month);
  let year = tempUpdate[2];
      year = parseInt(year);
  let updateISO = new Date(year, month - 1, day, hour, minute);

  let view = $('.list-info > li:last-child > p:nth-child(2)').text();
  console.log(view);
      view = view.replace('.','');
      view = parseInt(view);
  let cover = $('div.col-xs-4:nth-child(1) > img:nth-child(1)').attr('src');
  let description = $('.detail-content > p:nth-child(2)').text();

  let listCategory = [];

  $('.kind > p:nth-child(2) > a').each(function(index) {
    let category = $(this).text();
      listCategory.push(category);
  });
  // !Kết thúc bóc tách thông tin

    let manga;
    try {
      manga = await Manga.findOne({title: title, link: mangaLink});
      await Manga.update({title: title, link: mangaLink}, {
        name: name,
        author: listAuthor,
        status: status,
        update: update,
        updateISO: updateISO,
        view: view,
        cover: cover,
        category: listCategory,
        description: description
      });
    }
    catch(e) {
      console.log(e);
    }

    //Lấy danh sách các Chapters và các thông tin về chapter
    $('#nt_listchapter > nav:nth-child(2) > ul:nth-child(1) > li.row:not(.heading)').each(async function(index) {
      let rowChapter = await $(this).html();
      let $$ = cheerio.load(rowChapter);

      let chapterUrl = $$('a').attr('href');
      let chapterTitle = $$('a').text();
      let chapterNumber = chapterTitle.slice(chapterTitle.indexOf("ter ") + 4, chapterTitle.length).trim();
          chapterNumber = parseFloat(chapterNumber);
      let chapterUpdate = $$('div:nth-child(2)').text().trim();
      let chapterCount;
      try {
        chapterCount = await Chapter.count({'manga.id': manga._id, number: chapterNumber});
      }
      catch(e) {
        console.log(e);
      }

      await saveChapter(chapterCount, chapterUrl, chapterTitle, chapterNumber,
                        chapterUpdate, manga._id, manga.title);
    });

    await crawlChapter(manga._id); //Crawl chapter

}

var crawlManga = async function (mangaLink) {
  console.log("Crawling : " + mangaLink + "...");

  //Bóc tách thông tin
  let $ = cheerio.load(await getRawBody(mangaLink));
  let title = $('.title-detail').text();
  let name = $('h2.other-name').text() || title;
  let listAuthor = [];

  $('li.author > p:nth-child(2) a').each(function(index) {
      let author = $(this).text();
      listAuthor.push(author);
  });

  let status = $('.status > p:nth-child(2)').text();
  let update = $('time.small').text();
      update = update.slice(update.indexOf("lúc:") + 4, update.length).trim();
      update = update.replace(']','');
  let tempUpdate = update;
  let hour = update.slice(0,tempUpdate.indexOf(':')).trim();
      hour = parseInt(hour);
      tempUpdate = tempUpdate.slice(tempUpdate.indexOf(':') + 1, tempUpdate.length);
  let minute = tempUpdate.slice(0, tempUpdate.indexOf(' '));
      minute = parseInt(minute);

      tempUpdate = tempUpdate.slice(tempUpdate.indexOf(' '), tempUpdate.length).trim(); //Ket qua duoc ngay thang nam
      tempUpdate = tempUpdate.split('/');
  let day = tempUpdate[0];
      day = parseInt(day);
  let month = tempUpdate[1];
      month = parseInt(month);
  let year = tempUpdate[2];
      year = parseInt(year);
  let updateISO = new Date(year, month - 1, day, hour, minute);

  let view = $('.list-info > li:last-child > p:nth-child(2)').text();
  console.log(view);
      view = view.replace('.','');
      view = parseInt(view);
  let cover = $('div.col-xs-4:nth-child(1) > img:nth-child(1)').attr('src');
  let description = $('.detail-content > p:nth-child(2)').text();

  let listCategory = [];

  $('.kind > p:nth-child(2) > a').each(function(index) {
    let category = $(this).text();
      listCategory.push(category);
  });
  // !Kết thúc bóc tách thông tin

  let count;
  try {
    count = await Manga.count({title: title, link: mangaLink});
  }
  catch(e) {
    console.log(e);
  }

  if(count == 1) { // Nếu Manga đã được tạo
    console.log("Manga da ton tai!");
    let manga;
    try {
      manga = await Manga.findOne({title: title, link: mangaLink});
    }
    catch(e) {
      console.log(e);
    }

    //Lấy danh sách các Chapters và các thông tin về chapter
    $('#nt_listchapter > nav:nth-child(2) > ul:nth-child(1) > li.row:not(.heading)').each(async function(index) {
      let rowChapter = await $(this).html();
      let $$ = cheerio.load(rowChapter);

      let chapterUrl = $$('a').attr('href');
      let chapterTitle = $$('a').text();
      let chapterNumber = chapterTitle.slice(chapterTitle.indexOf("ter ") + 4, chapterTitle.length).trim();
          chapterNumber = parseFloat(chapterNumber);
      let chapterUpdate = $$('div:nth-child(2)').text().trim();
      let chapterCount;
      try {
        chapterCount = await Chapter.count({'manga.id': manga._id, number: chapterNumber});
      }
      catch(e) {
        console.log(e);
      }

      // await saveChapter(chapterCount, chapterUrl, chapterTitle, chapterNumber,
      //                   chapterUpdate, manga._id, manga.title);
      if(chapterCount < 1) {
          let newChapter = new Chapter({
            link: chapterUrl,
            title: chapterTitle,
            number: chapterNumber,
            update: chapterUpdate,
            manga: {
              id: mangaId,
              title: mangaTitle
            }
          });

          newChapter.save(function(e) {
              if(!e) {
                console.log("Chapter Saved!");
              }
          });
      }

    });

    await crawlChapter(manga._id); //Crawl chapter
  }
  if(count < 1){ //Nếu Manga chưa được tạo
    console.log("MANGA chua duoc tao! Dang tao moi...");
    let manga_new = new Manga({
      title: title,
      name: name,
      author: listAuthor,
      status: status,
      update: update,
      updateISO: updateISO,
      view: view,
      cover: cover,
      link: mangaLink,
      category: listCategory,
      description: description
    });

    let newManga;
    try{
      newManga = await manga_new.save();
    }
    catch(e) {
      console.log(e);
    }
    //Lấy danh sách các Chapters và các thông tin về chapter
    $('#nt_listchapter > nav:nth-child(2) > ul:nth-child(1) > li.row:not(.heading)').each(async function(index) {
      let rowChapter = await $(this).html();
      let $$ = cheerio.load(rowChapter);

      let chapterUrl = $$('a').attr('href');
      let chapterTitle = $$('a').text();
      let chapterNumber = chapterTitle.slice(chapterTitle.indexOf("ter ") + 4, chapterTitle.length).trim();
          chapterNumber = parseFloat(chapterNumber);
      let chapterUpdate = $$('div:nth-child(2)').text().trim();
      let chapterCount;
      try {
        chapterCount = await Chapter.count({'manga.id': newManga._id, number: chapterNumber});
      }
      catch(e) {
        console.log(e);
      }

      await saveChapter(chapterCount, chapterUrl, chapterTitle, chapterNumber,
                        chapterUpdate, newManga._id, newManga.title);

    });
    await crawlChapter(newManga._id);
    console.log("Da crawl xong chapter");
  }
}

var saveChapter = async function(chapterCount, chapterUrl, chapterTitle,
                chapterNumber, chapterUpdate, mangaId, mangaTitle) {

  if(chapterCount < 1) { //Nếu chapter chưa được tạo thì tạo mới
    let chapter = new Chapter({
      link: chapterUrl,
      title: chapterTitle,
      number: chapterNumber,
      update: chapterUpdate,
      manga: {
        id: mangaId,
        title: mangaTitle
      }
    });

    await chapter.save();
  }
  console.log(chapterTitle + " Saved!");
}

var crawlChapter = async function(mangaId) {

  let listChapters;
  try {
    listChapters = await Chapter.find({'manga.id': mangaId});
  }
  catch(e) {
    console.log(e);
  }

  for(var i = 0; i < listChapters.length; i++) {
    let chapter = listChapters[i];
    let images = [];

    let bodyChapter = await getRawBody(chapter.link);
    let $ = cheerio.load(bodyChapter);

    $('.page-chapter img').each(async function(index) {
        //let src = await $(this).attr('src');
        images.push($(this).attr('src'));
        //console.log(src);
    });

    try {
       await Chapter.updateOne({'manga.id': mangaId, title: chapter.title}, {images: images});
       console.log(chapter.title + " updated!");
    }
    catch(e) {
      console.log(e);
    }

  }
  console.log("DA HOAN THANH!");
}

app.get('/crawl-manga',async function(req, res) {
  let mangaLink = 'http://www.nettruyen.com/truyen-tranh/dao-quanh-lanh-dia-demon';

  let $ = cheerio.load(await getRawBody(mangaLink));
  let title = $('.title-detail').text();
  let name = $('h2.other-name').text() || title;
  let listAuthor = [];

  $('li.author > p:nth-child(2) a').each(function(index) {
      let author = $(this).text();
      listAuthor.push(author);
  });

  let status = $('.status > p:nth-child(2)').text();
  let update = $('time.small').text();
      update = update.slice(update.indexOf("lúc:") + 4, update.length).trim();
      update = update.replace(']','');
  let tempUpdate = update;
  let hour = update.slice(0,tempUpdate.indexOf(':')).trim();
      hour = parseInt(hour);
      tempUpdate = tempUpdate.slice(tempUpdate.indexOf(':') + 1, tempUpdate.length);
  let minute = tempUpdate.slice(0, tempUpdate.indexOf(' '));
      minute = parseInt(minute);

      tempUpdate = tempUpdate.slice(tempUpdate.indexOf(' '), tempUpdate.length).trim(); //Ket qua duoc ngay thang nam
      tempUpdate = tempUpdate.split('/');
  let day = tempUpdate[0];
      day = parseInt(day);
  let month = tempUpdate[1];
      month = parseInt(month);
  let year = tempUpdate[2];
      year = parseInt(year);
  let updateISO = new Date(year, month - 1, day, hour, minute);

  let view = $('.list-info > li:last-child > p:nth-child(2)').text();
  console.log(view);
      view = view.replace('.','');
      view = parseInt(view);
  let cover = $('div.col-xs-4:nth-child(1) > img:nth-child(1)').attr('src');
  let description = $('.detail-content > p:nth-child(2)').text();

  let listCategory = [];

  $('.kind > p:nth-child(2) > a').each(function(index) {
    let category = $(this).text();
      listCategory.push(category);
  });

  let count;
  try {
    count = await Manga.count({title: title, link: mangaLink});
  }
  catch(e) {
    console.log(e);
  }

  if(count == 1) {
    let manga;
    try {
      manga = await Manga.findOne({title: title, link: mangaLink});
    }
    catch(e) {
      console.log(e);
    }

    $('#nt_listchapter > nav:nth-child(2) > ul:nth-child(1) > li.row:not(.heading)').each(async function(index) {
      let rowChapter = await $(this).html();
      let $$ = cheerio.load(rowChapter);

      let chapterUrl = $$('a').attr('href');
      let chapterTitle = $$('a').text();
      let chapterNumber = chapterTitle.slice(chapterTitle.indexOf("ter ") + 4, chapterTitle.length).trim();
          chapterNumber = parseFloat(chapterNumber);
      let chapterUpdate = $$('div:nth-child(2)').text().trim();
      let chapterCount;
      try {
        chapterCount = await Chapter.count({'manga.id': manga._id, number: chapterNumber});
      }
      catch(e) {
        console.log(e);
      }

      if(chapterCount < 1) {
        let chapter = new Chapter({
          link: chapterUrl,
          title: chapterTitle,
          number: chapterNumber,
          update: chapterUpdate,
          manga: {
            id: manga._id,
            title: manga.title
          }
        });

        await chapter.save();
      }

      console.log("Da luu: " + chapterTitle);
    });

    res.redirect('/crawl-chapter/' + manga._id);
  }
  else {

    let manga = new Manga({
      title: title,
      name: name,
      author: listAuthor,
      status: status,
      update: update,
      updateISO: updateISO,
      view: view,
      cover: cover,
      link: mangaLink,
      category: listCategory,
      description: description
    });

    let newManga;
    try{
      newManga = await manga.save();
    }
    catch(e) {
      console.log(e);
    }

    $('#nt_listchapter > nav:nth-child(2) > ul:nth-child(1) > li.row:not(.heading)').each(async function(index) {
      let rowChapter = await $(this).html();
      let $$ = cheerio.load(rowChapter);

      let chapterUrl = $$('a').attr('href');
      let chapterTitle = $$('a').text();
      let chapterNumber = chapterTitle.slice(chapterTitle.indexOf("ter ") + 4, chapterTitle.length).trim();
          chapterNumber = parseFloat(chapterNumber);
      let chapterUpdate = $$('div:nth-child(2)').text().trim();
      let chapterCount;
      try {
        chapterCount = await Chapter.count({'manga.id': newManga._id, number: chapterNumber});
      }
      catch(e) {
        console.log(e);
      }

      if(chapterCount < 1) {
        let chapter = new Chapter({
          link: chapterUrl,
          title: chapterTitle,
          number: chapterNumber,
          update: chapterUpdate,
          manga: {
            id: newManga._id,
            title: newManga.title
          }
        });

        await chapter.save();
      }

      console.log("Da luu: " + chapterTitle);
    });
    res.redirect('/crawl-chapter/' + newManga._id);
  }
});

app.get('/crawl-chapter/:mangaId', async function(req, res) {
	let mangaId = req.params.mangaId;

	let listChapters;
	try {
		listChapters = await Chapter.find({'manga.id': mangaId});
	}
	catch(e) {
		console.log(e);
	}

	for(var i = 0; i < listChapters.length; i++) {
		let chapter = listChapters[i];
		let images = [];

    let bodyChapter = await getRawBody(chapter.link);
    let $ = cheerio.load(bodyChapter);

    $('.page-chapter img').each(async function(index) {
        //let src = await $(this).attr('src');
        images.push($(this).attr('src'));
        //console.log(src);
    });

    try {
       await Chapter.updateOne({'manga.id': mangaId, title: chapter.title}, {images: images});
       console.log(chapter.title + " updated!");
    }
    catch(e) {
      console.log(e);
    }

	}
	res.send("Da hoa tat");
});

app.get('/chap', function(req, res) {
    Chapter.find({'manga.id': "5bb2e69e0650eb19fcbe81b0"})
           .sort({'number': 1})
           .exec( function(err, chapters) {
               if(!err) {
                 //res.render('index', {chapter: chapters[0]});
                 res.send(chapters);
               }
           })
});

app.get('/home', function(req, res) {
    res.render('index');
});

app.get('/manga', function(req, res) {
    var category = req.query.category;
    var author = req.query.author;
	  var type = req.query.type || 'view';

	if(category != undefined && author != undefined) {

	    if(type == 'new') {
	    	Manga.find({category: category, author: author}).sort({updateISO: -1}).exec(function(err, mangas) {
		    	if(!err) {
		    		res.json(mangas);
		    	}
		    });
	    }
	    else {
	    	Manga.find({category: category, author: author}).sort({view: 1}).exec(function(err, mangas) {
		    	if(!err) {
		    		res.send(mangas);
		    	}
		    });
	    }

	}
	else if(category == undefined && author != undefined){
		if(type == 'view') {
			Manga.find({author: author}).sort({view: -1}).exec(function(err, mangas) {
			    	if(!err) {
			    		res.send(mangas);
			    	}
			});
		}
		else {
			Manga.find({author: author}).sort({updateISO: -1}).exec(function(err, mangas) {
			    	if(!err) {
			    		res.send(mangas);
			    	}
			});
		}
	}
	else if(category != undefined && author == undefined){
		if(type == 'view') {
			Manga.find({category: category}).sort({view: -1}).exec(function(err, mangas) {
			    	if(!err) {
			    		res.send(mangas);
			    	}
			});
		}
		else {
			Manga.find({category: category}).sort({updateISO: -1}).exec(function(err, mangas) {
			    	if(!err) {
			    		res.send(mangas);
			    	}
			});
		}
	}
	else {
		if(type == 'view') {
			Manga.find({}).sort({view: -1}).exec(function(err, mangas) {
			    	if(!err) {
			    		res.send(mangas);
			    	}
			});
		}
		else {
			Manga.find({}).sort({updateISO: -1}).exec(function(err, mangas) {
			    	if(!err) {
			    		res.send(mangas);
			    	}
			});
		}
	}

});
app.get('/manga/:id', async function(req, res) {
	var id = req.params.id;
	let manga;
	let chapters;
	try {
		manga = await Manga.findOne({_id: id});
		chapters = await Chapter.find({'manga.id': manga._id}).select('title _id').sort({number: -1});
	}
	catch (e) {
		res.json({error: e});
	}

	res.json({manga: manga, chapters: chapters});

});

app.get('/chapter/:id', function(req, res) {
    var id = req.params.id;
    Chapter.findOne({_id: id}, function(err, chapter) {
        if(err) {
          res.json({error: err});
        }
        else {
          res.json(chapter);
        }
    });
});

app.get('/test', async function(req,res) {
    var link = 'http://www.nettruyen.com/truyen-tranh/yeu-than-ky/chap-192/408512';

    let response;
    try {
      response = await getRawBody(link);
    }
    catch(e) {
      console.log(e)
    }

    let $ = cheerio.load(response);

    $('.page-chapter img').each(async function(index) {
        let src = await $(this).attr('src');
        console.log(src);
    });

    res.send($.html());
});

async function getRawBody(url) {
	let response;
	try{
		response = await request(url);
	}
	catch(e) {
		console.log(e);
	}

	return response.body;
}

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
