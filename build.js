#!/usr/bin/env node
const cp=require('child_process');
const fs=require('fs');
const path=require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { dirExists,
        fileExists,
        makeDirIfNotExist,
        zipDir, 
        compileFrontEnd,
        connectScp,
        uploadFile,
        getProcessInfo,
        updateProcessInfo,
        getDotInfo,
        incrementVersion,
        makeRequiredDirs,
        buildNodeBackendEnd,
        packageModule,
        makeDotInfoFile
    }=require('./helpers');


async function build(majorVersion){

    const CWD=process.cwd();
    const EXE_D=path.dirname(typeof process.env.NODE_SEA === 'string'?process.execPath:require.main.filename)
    const MODULE_ENV=fileExists(path.join(CWD,'package.json'))?
                        "nodeJS":
                        // TODO Python support
                        // dirExists(path.join(CWD,'.env'))?
                        // 'python':
                        null;
    if(MODULE_ENV==null) throw new Error("Unsupported environment.");

    if(!fileExists(path.join(CWD,'build_config.json'))){
        console.log(`build_config.json file missing, at ${CWD}`);
        process.exit();
    }

    if(!fileExists(path.join(EXE_D,'builder_config.json'))){
        console.log(`builder_config.json file missing, at ${EXE_D}`)
        process.exit();
    }
    const build_config=require(path.join(CWD,"build_config.json"));
    const builder_config=require('./builder_config.json');




























    if(majorVersion==null) throw new Error("Version number is required. Format Eg.: -v 2");


    const apiConfig=builder_config.api[`v${majorVersion}`]
    if(apiConfig==null) throw new Error('builder_config.json is not properly configured. Check [api.v{X} .]')

    const dotInfo=getDotInfo(CWD);
    const processInfo=await getProcessInfo(apiConfig.root,apiConfig.apiKey,dotInfo.id);
    
    const scp_client=await connectScp(builder_config.ssh.host,builder_config.ssh.username,builder_config.ssh.password,builder_config.ssh.port);
    console.log("Previous Process State:",processInfo);

    const processInfoUpdated=JSON.parse(JSON.stringify(processInfo));

    const newVersion=incrementVersion(processInfo.versions.required)

    processInfoUpdated.versions.required=newVersion
    processInfoUpdated.versions.latest=newVersion
    const uploadZipName=`v${newVersion}+${processInfo._id}.zip`
    processInfoUpdated.versions.url=`https://${apiConfig.cdnDomain}/files/modules/v${majorVersion}/${processInfo._id}/${uploadZipName}`

    console.log("Updated State:",{
        Name:processInfoUpdated.Name,
        _id:processInfoUpdated._id,
        versions:processInfoUpdated.versions
    })
    const parallelBuildJobs=[]
    const dirs=makeRequiredDirs(path.join(CWD,"build"),MODULE_ENV)
    if(build_config.build.frontend.skip==false){
        parallelBuildJobs.push(compileFrontEnd(path.join(CWD,'Frontend'),dirs.ui));
    }
    if(build_config.build.backend.skip==false){
        if(MODULE_ENV=='nodeJS'){
            parallelBuildJobs.push(buildNodeBackendEnd(processInfo._id,CWD,dirs.webpack,dirs.tsc,dirs.exe));
        }
    }
    for (let prom of parallelBuildJobs){
        await prom
        if(prom.success==false){
            console.log(prom.message)
            throw prom.err
        }
    }
    const includeFiles=Array.isArray(build_config.build.backend.include)?build_config.build.backend.include:[]
    makeDotInfoFile(processInfo._id,processInfo.Name,newVersion,path.join(CWD,'build','.info'))
    includeFiles.push({
        type:'file',
        from:'./build/.info',
        to:'.info'
    })
    packageModule(CWD,MODULE_ENV,majorVersion,processInfo._id,includeFiles);
    const finalZipFrom=path.join(CWD,'build',`${processInfo._id}`)
    const finalZipTo=path.join(CWD,'build',`${processInfo._id}.zip`)
    await zipDir(finalZipFrom,finalZipTo)
    await updateProcessInfo(apiConfig.root,apiConfig.apiKey,dotInfo.id,newVersion,processInfoUpdated.versions.url)

    await uploadFile(finalZipTo,`v${majorVersion}/${processInfo._id}`,uploadZipName, scp_client)
    
}

module.exports={build}