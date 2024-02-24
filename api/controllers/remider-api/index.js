'use strict';

const HELPER_BASE = process.env.HELPER_BASE || "/opt/";
const Response = require(HELPER_BASE + 'response');

const API_KEY = "12345678";
const NOTIFICATION_BASE_URL = "https://【通知用サーバのURL】";

const REMINDER_TABLE_NAME = "reminder";
const REMINDER_FILE_PATH = process.env.THIS_BASE_PATH + '/data/reminder/reminder.db';
const NOTIFICATION_API_KEY = "12345678";
const ABSENT_INTERVAL = 1000 * 60 * 60;
const DEFAULT_CLIENT_ID = "②";
const LIST_PAST_DURATION = 1000 * 60 * 60 * 24 * 30;

const crypto = require('crypto');
const sqlite3 = require("sqlite3");
const ping = require('ping');
const fetch = require('node-fetch');
const Headers = fetch.Headers;

const db = new sqlite3.Database(REMINDER_FILE_PATH);
db.each("SELECT COUNT(*) FROM sqlite_master WHERE TYPE = 'table' AND name = '" + REMINDER_TABLE_NAME + "'", (err, row) => {
    if (err) {
        console.error(err);
        return;
    }
    if (row["COUNT(*)"] == 0) {
        db.run(`CREATE TABLE '${REMINDER_TABLE_NAME}' (id TEXT PRIMARY KEY, topic TEXT, title TEXT, body TEXT, updated_at INTEGER, finished_at INTEGER, sent_at INTEGER, alive_at INTEGER)`, (err, row) => {
            if (err) {
                console.error(err);
                return;
            }
        });
    }
});

exports.handler = async (event, context, callback) => {
    var body = JSON.parse(event.body);
    console.log(body);

    if (event.requestContext.apikeyAuth.apikey != API_KEY)
        throw "apikey invalid";

    if (event.path == '/reminder-add-item') {
        var _topic = body.topic;
        var _title = body.title;
        var _immediate = body.immediate;
        var _finished = body.finished;
        var _body = body.body;

        var now = new Date().getTime();
        var id = crypto.randomUUID();

        await new Promise((resolve, reject) => {
            if( _finished ){
                db.run(`INSERT INTO '${REMINDER_TABLE_NAME}' (id, topic, title, body, finished_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, [id, _topic, _title, _body, now, now], (err) => {
                    if (err)
                        return reject(err);
                    resolve({});
                });
            }else{
                db.run(`INSERT INTO '${REMINDER_TABLE_NAME}' (id, topic, title, body, updated_at) VALUES (?, ?, ?, ?, ?)`, [id, _topic, _title, _body, now], (err) => {
                    if (err)
                        return reject(err);
                    resolve({});
                });
            }
        });

        if (_immediate) {
            var result = await send_message(DEFAULT_CLIENT_ID, _title, _body, now);
            console.log(result);
        }

        return new Response({
            id: id
        });
    } else

    if (event.path == '/reminder-list-item') {
        var _topic = body.topic;
        var _include_finished = body.include_finished;

        var now = new Date().getTime();
		return new Promise((resolve, reject) => {
            if( _include_finished ){
                const sql = `SELECT * FROM '${REMINDER_TABLE_NAME}' 
                    WHERE topic = ? 
                    AND (finished_at IS NULL OR finished_at >= ?)  
                    ORDER BY updated_at DESC`;
                db.all(sql, [_topic, now - LIST_PAST_DURATION], (err, rows) => {
                    if (err)
                        return reject(err);
                    resolve(new Response({
                        rows: rows
                    }));
                });
            }else{
                const sql = `SELECT * FROM '${REMINDER_TABLE_NAME}' 
                    WHERE topic = ? 
                    AND finished_at IS NULL  
                    ORDER BY updated_at DESC`;
                db.all(sql, [_topic], (err, rows) => {
                    if (err)
                        return reject(err);
                    resolve(new Response({
                        rows: rows
                    }));
                });
            }
		});
    } else

    if (event.path == '/reminder-remove-item') {
        var id = body.id;
        return new Promise((resolve, reject) => {
            db.all(`DELETE FROM '${REMINDER_TABLE_NAME}' WHERE id = ?`, [id], (err) => {
                if (err)
                    return reject(err);
                resolve(new Response({}));
            });
        });
    } else

    if (event.path == '/reminder-update-item') {
        var now = new Date().getTime();

        var _id = body.id;
		var _title = body.title;
		var _body = body.body;
		var _finished = body.finished;
        var _immediate = body.immediate;
        
		var values = [now, _id];
		var colums = ["updated_at = ?"];

		if( _title !== undefined ){
			values.unshift(_title);
			colums.unshift("title = ?");
		}
		if( _body !== undefined ){
			values.unshift(_body);
			colums.unshift("body = ?");
		}
		if( _finished !== undefined ){
			values.unshift(_finished ? now : null);
			colums.unshift("finished_at = ?");
		}

        if( _immediate ){
            var result = await send_message(DEFAULT_CLIENT_ID, _title, _body, now);
            console.log(result);
        }

        return new Promise((resolve, reject) => {
			var set_str = colums.join(",");
			console.log(set_str, values);
			db.all(`UPDATE '${REMINDER_TABLE_NAME}' SET ${set_str} WHERE id = ?`, values, (err) => {
                if (err)
                    return reject(err);
                resolve(new Response({}));
            });
        });
    } else

    {
        throw "unknown endpoint";
    }
};

exports.cron_handler = async (event, context, callback) => {
    const sql = `SELECT DISTINCT topic FROM '${REMINDER_TABLE_NAME}'`;
    db.all(sql, [], async (err, rows) => {
        if( err ){
            console.error(err);
            return;
        }

        for( const row of rows ){
            console.log('ping check: ' + row.topic);
            ping.sys.probe(row.topic, async (isAlive) =>{
                console.log("host:" + row.topic + " is " + (isAlive ? "alive" : "dead"));
                if( !isAlive )
                    return;
        
                const sql = `SELECT * FROM '${REMINDER_TABLE_NAME}' 
                    WHERE topic = ? 
                    AND finished_at IS NULL  
                    ORDER BY updated_at DESC`;
                db.all(sql, [row.topic], async (err, rows) => {
                    if (err){
                        console.error(err);
                        return;
                    }
        
                    var now = new Date().getTime();
                    for( const row of rows){
                        console.log(row);
                        if( !row.sent_at || now > (row.alive_at + ABSENT_INTERVAL)){
                            try{
                                var result = await send_message(DEFAULT_CLIENT_ID, row.title, row.body, now);
                                console.log(result);
        
                                db.all(`UPDATE '${REMINDER_TABLE_NAME}' SET sent_at = ?, alive_at = ? WHERE id = ?`, [now, now, row.id], (err) => {
                                    if( err ){
                                        console.error(err);
                                        return;
                                    }
                                });
                            }catch(error){
                                console.error(error);
                            }
                        }else{
                            try{
                                db.all(`UPDATE '${REMINDER_TABLE_NAME}' SET alive_at = ? WHERE id = ?`, [now, row.id], (err) => {
                                    if( err ){
                                        console.error(err);
                                        return;
                                    }
                                });
                            }catch(error){
                                console.error(error);
                            }

                        }
                    }
                });
            });
        }
    });
    
};
  
function do_post_with_apikey(url, body, apikey) {
    const headers = new Headers({
        "Content-Type": "application/json",
        "X-API-KEY": apikey
    });

    return fetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: headers
        })
        .then((response) => {
            if (!response.ok)
                throw new Error('status is not 200');
            return response.json();
        });
}

async function send_message(client_id, title, body, datetime){
    var params = {
        topic: "fcm_notification",
        client_id: client_id,
        title: title,
        datetime: datetime,
        body: body
    };
    var result = await do_post_with_apikey(NOTIFICATION_BASE_URL + "/notification-push-message", params, NOTIFICATION_API_KEY);
    return result;
}
