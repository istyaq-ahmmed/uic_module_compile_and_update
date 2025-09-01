const builder_config=require('./builder_config.json')
const fs=require('fs')
const path=require('path')
function isEmpty(val){
    if(val==null) return true
    if(typeof val=='string'){
        if(val.trim()=='') return true
    }
    return false
}
function checkConfig(version){
    let OK=true;
    function log(out,type='e'){
        if(type=='e') OK=false;
        console.log(out)
    }
    if(isEmpty(builder_config.ssh.host)) log("SSH host is not set. Set it via ibau config --ssh.host <host>")
    if(isEmpty(builder_config.ssh.username)) log("SSH username is not set. Set it via ibau config --ssh.usr <username>")
    if(isEmpty(builder_config.ssh.password)) log("SSH password is not set. Set it via ibau config --ssh.pas <password>")
    if(version=="2"){
        if(isEmpty(builder_config.api.v2.apiKey)) log("v2 apiKey is not set. Set it via ibau config --v2.apiKey <apiKey>")
    }else{
        console.log("Currently only version 2 Node Environment is supported.")
    }
    log("Config Looks good...",'n')
    log("⚠️ Make sure vpn is connected...",'n')
    return OK
}

function configBuilder(options){
    let changed=false;
    if(options['ssh.host']!=null) {
        changed=true
        builder_config.ssh.host=options['ssh.host']
    }
    if(options['ssh.usr']!=null) {
        changed=true
        builder_config.ssh.username=options['ssh.usr']
    }
    if(options['ssh.pas']!=null) {
        changed=true
        builder_config.ssh.password=options['ssh.pas']
    }
    if(options['v2.key']!=null) {
        changed=true
        builder_config.api.v2.apiKey=options['v2.key']
    }
    if(changed){
        // TODO FIX this if compiled to exe
        fs.writeFileSync(path.join(__dirname,'builder_config.json'),JSON.stringify(builder_config,undefined,2));
        return true;
    }else{
        return false;
    }
}


module.exports={
    checkConfig,
    configBuilder
}