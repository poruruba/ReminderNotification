'use strict';

//const vConsole = new VConsole();
//const remoteConsole = new RemoteConsole("http://[remote server]/logio-post");
//window.datgui = new dat.GUI();

const base_url = "";

var vue_options = {
    el: "#top",
    mixins: [mixins_bootstrap],
    store: vue_store,
    router: vue_router,
    data: {
        topic: "",
        item_list: [],
        params_add_item: {},
        params_update_item: {},
        target_item: {},
        include_finished: false,
        apikey: "",
    },
    computed: {
    },
    methods: {
        do_delete_item: async function(index){
            if( !confirm("本当に削除しますか？") )
                return;

            var params = {
                id: this.item_list[index].id,
            };
            var result = await do_post_with_apikey(base_url + "/reminder-remove-item", params, this.apikey);
            console.log(result);
            this.toast_show("削除しました。");
            await this.update_list();
        },

        change_apikey: function(){
            var apikey = prompt("APIキーを指定してください。", this.apikey);
            if( !apikey )
                return;

            this.apikey = apikey;
            localStorage.setItem("reminder_apikey", apikey);
            this.update_list();
        },
        change_topic: function(){
            var topic = prompt("対象デバイスのIPアドレスを指定してください。", this.topic);
            if( !topic )
                return;

            this.topic = topic;
            localStorage.setItem("reminder_topic", topic);
            this.update_list();
        },

        do_finish_item: async function(){
            var params = {
                id: this.target_item.id,
                finished: true
            };
            var result = await do_post_with_apikey(base_url + "/reminder-update-item", params, this.apikey);
            console.log(result);

            this.dialog_close("#dialog_view_item");
            this.toast_show("完了にしました。");
            await this.update_list();
        },

        view_item: async function(index){
            this.target_item = this.item_list[index];
            this.dialog_open("#dialog_view_item");
        },

        update_list: async function(){
            var params = {
                topic: this.topic,
                include_finished: this.include_finished
            };
            var result = await do_post_with_apikey(base_url + "/reminder-list-item", params, this.apikey);
            console.log(result);
            this.item_list = result.rows;
        },

        start_update_item: async function(index){
            this.params_update_item = JSON.parse(JSON.stringify(this.item_list[index]));
            this.params_update_item.finished = this.params_update_item.finished_at ? true : false;

            this.dialog_open("#dialog_update_item");
        },
        do_update_item: async function(){
            var params = {
                id: this.params_update_item.id,
            };
            params.title = this.params_update_item.check_title ? this.params_update_item.title : undefined;
            params.body = this.params_update_item.check_body ? this.params_update_item.body : undefined;
            params.immediate = this.params_update_item.check_immediate ? this.params_update_item.immediate : undefined;
            params.finished = this.params_update_item.check_finished ? this.params_update_item.finished : undefined;

            var result = await do_post_with_apikey(base_url + "/reminder-update-item", params, this.apikey);
            console.log(result);

            this.dialog_close("#dialog_update_item");
            this.toast_show("変更しました。");
            await this.update_list();
        },

        start_add_item: async function(){
            this.params_add_item = {
                topic: this.topic
            };
            this.dialog_open("#dialog_add_item");
        },
        do_add_item: async function(){
            var params = {
                topic: this.params_add_item.topic,
                title: this.params_add_item.title,
                body: this.params_add_item.body,
                immediate: this.params_add_item.immediate,
                finished: this.params_add_item.finished,
            };

            var result = await do_post_with_apikey(base_url + "/reminder-add-item", params, this.apikey);
            console.log(result);

            this.dialog_close("#dialog_add_item");
            this.toast_show("追加しました。");
            await this.update_list();
        }
    },
    created: function(){
    },
    mounted: async function(){
        proc_load();
        
        this.topic = localStorage.getItem('reminder_topic');
        this.apikey = localStorage.getItem('reminder_apikey');
        await this.update_list();
        
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').then(async (registration) => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }).catch((err) => {
                console.log('ServiceWorker registration failed: ', err);
            });
        }
    }
};
vue_add_data(vue_options, { progress_title: '' }); // for progress-dialog
vue_add_global_components(components_bootstrap);
vue_add_global_components(components_utils);

/* add additional components */

window.vue = new Vue( vue_options );

function do_post_with_apikey(url, body, apikey) {
    const headers = new Headers({ "Content-Type": "application/json", "X-API-KEY": apikey });
  
    return fetch(url, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: headers
    })
    .then((response) => {
      if (!response.ok)
        throw new Error('status is not 200');
      return response.json();
  //    return response.text();
  //    return response.blob();
  //    return response.arrayBuffer();
    });
  }