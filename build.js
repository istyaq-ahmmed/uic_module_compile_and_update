#!/usr/bin/env node
const cp=require('child_process');
const fs=require('fs');
const os=require('os');

const path=require('path');
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
        makeDotInfoFile,
        buildPython,
        getFileHash
    }=require('./helpers');


const stepLogs={}
async function build_s(majorVersion){
    const CWD=process.cwd();
    const EXE_D=path.dirname(typeof process.env.NODE_SEA === 'string'?process.execPath:require.main.filename)
    const MODULE_ENV=fileExists(path.join(CWD,'package.json'))?
                        "nodeJS":
                        fileExists(path.join(CWD,'requirements.txt'))?
                        'python':
                        null;
    if(MODULE_ENV==null) throw new Error("Unsupported environment.");

    if(!fileExists(path.join(CWD,'build_config.json'))){
        console.log(`build_config.json file missing, at ${CWD}`);
        process.exit();
    }
    if(!fileExists(path.join(EXE_D,os.hostname()=='Chunkey'?'builder_configDev.json':'builder_config.json'))){
        console.log(`builder_config.json file missing, at ${EXE_D}`)
        process.exit();
    }
    const build_config=require(path.join(CWD,"build_config.json"));
    let builder_config=require(os.hostname()=='Chunkey'?'./builder_configDev.json':'./builder_config.json');




























    if(majorVersion==null) throw new Error("Version number is required. Format Eg.: -v 2");


    const apiConfig=builder_config.api[`v${majorVersion}`]
    if(apiConfig==null) throw new Error('builder_config.json is not properly configured. Check [api.v{X} .]')

    const dotInfo=getDotInfo(CWD);
    const processInfo=await getProcessInfo(apiConfig.root,apiConfig.apiKey,dotInfo.id);
    
    const scp_client=await connectScp(builder_config.ssh.host,builder_config.ssh.username,builder_config.ssh.password,builder_config.ssh.port);
    console.log("Previous Process State:",processInfo);

    const processInfoUpdated=JSON.parse(JSON.stringify(processInfo));

    const newVersion=incrementVersion(processInfo.versions.required,majorVersion)

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
        stepLogs.frontend_compile={
            skipped:false,
            success:false,
            message:'N/A'
        }
        parallelBuildJobs.push(compileFrontEnd(path.join(CWD,'Frontend'),dirs.ui));
    }else{
        stepLogs.frontend_compile={
            skipped:true,
            success:false,
            message:'Skipped.'
        }
    }
    if(build_config.build.backend.skip==false){
        stepLogs.compile_backend={
            skipped:false,
            success:false,
            message:'N/A'
        }
        if(MODULE_ENV=='nodeJS'){
            parallelBuildJobs.push(buildNodeBackendEnd(processInfo._id,CWD,dirs.webpack,dirs.tsc,dirs.exe));
        }else if(MODULE_ENV=='python'){
            parallelBuildJobs.push(buildPython(CWD,newVersion));
        }else{
            stepLogs.compile_backend={
                skipped:false,
                success:false,
                message:"Invalid Backend Configuration."
            }
        }
    }else{
        stepLogs.compile_backend={
            skipped:true,
            success:false,
            message:'Skipped.'
        }
    }
    const errors=[]
    for (let prom of await Promise.all(parallelBuildJobs)){
        console.log('Resolved one')
        console.log(prom.message)
        if(prom.success==false){
            errors.push(prom.err)
        }
        
        stepLogs[prom.type]=prom
    }
    if(errors.length>0){
        throw errors[0]
    }


    const includeFiles=Array.isArray(build_config.build.backend.include)?build_config.build.backend.include:[]
    makeDotInfoFile(processInfo._id,processInfo.Name,newVersion,path.join(CWD,'build','.info'))
    includeFiles.push({
        type:'file',
        from:'./build/.info',
        to:'.info'
    })
    const finalZipFrom=path.join(CWD,'build',`${processInfo._id}`)
    const finalZipTo=path.join(CWD,'build',`${uploadZipName}`)

    if(build_config.compress.skip==false){
        stepLogs.archive={
            skipped:false,
            success:false,
            message:'N/A'
        }
        packageModule(CWD,MODULE_ENV,majorVersion,processInfo._id,includeFiles);
        await zipDir(finalZipFrom,finalZipTo);
        stepLogs.archive={
            skipped:false,
            success:true,
            message:"Archive saved to: "+finalZipTo
        }
    }else{
        stepLogs.archive={
            skipped:true,
            success:false,
            message:"Skipped."
        }
    }
    const execPath=path.join(dirs.exe,processInfo._id+'.exe');
    if(build_config.hash.skip==false){
        stepLogs.hash={
            skipped:false,
            success:false,
            message:'N/A'
        }
        processInfoUpdated.versions.exeHash=await getFileHash(execPath);
        processInfoUpdated.versions.zipHash=await getFileHash(finalZipTo);
        const savedTo=path.join(CWD,'build',`v${newVersion}+${processInfo._id}.json`)
        fs.writeFileSync(savedTo,JSON.stringify({
            "exe": {
                "Algorithm": "SHA256",
                "Hash": processInfoUpdated.versions.exeHash,
                "Path": execPath
            },
            "zip": {
                "Algorithm": "SHA256",
                "Hash": processInfoUpdated.versions.zipHash,
                "Path": finalZipTo
            },
            "version": newVersion
        })
        )
        stepLogs.hash={
            skipped:false,
            success:true,
            message:"Hash saved to: "+savedTo
        }
    }else{
        stepLogs.hash={
            skipped:true,
            success:false,
            message:"Skipped."
        }
    }
    if(build_config.publish.skip==false ){
        if(build_config.hash.skip==true) {
            stepLogs.publish={
                skipped:false,
                success:false,
                message:"Hashing is set to skip. Can't update files."
            }
            console.log("Hashing is set to skip. Can't update files.")
        }else{
            stepLogs.publish={
                skipped:false,
                success:false,
                message:"N/A"
            }
            await uploadFile(finalZipTo,`v${majorVersion}/${processInfo._id}`,uploadZipName, scp_client)
            stepLogs.publish={
                skipped:false,
                success:false,
                message:"File upload failed."
            }
            await updateProcessInfo(apiConfig.root,
                                    apiConfig.apiKey,
                                    dotInfo.id,
                                    newVersion,
                                    processInfoUpdated.versions.url)
            stepLogs.publish={
                skipped:false,
                success:true,
                message:"Module Published successfully."
            }
            
        }
    }else{
        stepLogs.publish={
                skipped:true,
                success:false,
                message:"Skipped."
            }
    }
    const processInfoLatest=await getProcessInfo(apiConfig.root,apiConfig.apiKey,dotInfo.id);
    console.log('Updated Process Info:',processInfoLatest)
}
async function build(m) {
    try {
        await build_s(m)
    } catch (error) {
        console.log(error)
    }
    
    console.log("Build Log: ",stepLogs)
}

module.exports={build}