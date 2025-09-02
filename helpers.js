
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const cp=require('child_process');
const scp = require('node-scp');
const axios=require('axios')
const ts = require('typescript');
const crypto = require("crypto");

function fileExists(loc){
    if (fs.existsSync(loc)) {
        if (fs.lstatSync(loc).isFile()) {
            return true
        }
        else {
            return false
        }
    } else {
        return false
    }
}
function dirExists(loc){
    if (fs.existsSync(loc)) {
        if (fs.lstatSync(loc).isDirectory()) {
            return true
        } 
        else {
            return false
        }
    } else {
        return false
    }
}

function makeDirIfNotExist(loc='',rm=false){
    // console.log('Mkdir:',loc);
    if(!fs.existsSync(loc)){
        if(rm) fs.rmSync(loc,{recursive:true});
        fs.mkdirSync(loc,{recursive:true})
    }
    return loc
}
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function zipDir(src,out){
        const output = fs.createWriteStream(out);
        const archive = archiver('zip', {
        zlib: { level: 9 } // Maximum compression
        });
        
        // Listen for events
        output.on('close', () => {
            console.log(`✅ Zipped ${formatBytes(archive.pointer())} total bytes`);
        });
        archive.on('error', err => {
            throw err;
        });
        
        // Pipe archive data to the file
        archive.pipe(output);
        
        // Append the folder
        archive.directory(src, false); // false = no root folder in zip
        
        // Finalize the archive
        return archive.finalize();
}

function loadModule(name) {
  try {
    const module = require(name);
    return module;
  } catch (err) {
    throw new Error(`❌ Failed to load module: ${name}`, err);
  }
}

function minifyNodeJS(entry,outputDir){
    const webpack = require('webpack');
    const config={
                    entry: entry,
                    output: {
                        path: outputDir,
                        filename: `built.js`,
                    },
                    target: "node",
                    mode: "production",
                    plugins: [
                        new webpack.optimize.LimitChunkCountPlugin({
                        maxChunks: 1,
                        }),
                    ],
                    }
                        
    return new Promise((resolve, reject) => {
    // Inject ProgressPlugin
    config.plugins = config.plugins || [];
    config.plugins.push(
      new webpack.ProgressPlugin((percentage, message, ...args) => {
        const percent = Math.round(percentage * 100);
          process.stdout.write(`\r🛠 ${percent}% - ${message}`);
      })
    );

    // Run webpack
    webpack(config, (err, stats) => {
      if (err) {    
        console.log('\n');
        return reject(err);
    }

      const info = stats.toJson();

      if (stats.hasErrors()) {
        console.log('\n');
        return reject(new Error(info.errors.join('\n')));
      }
      console.log('\n');
      resolve(stats);
    });
    });
}



async function runTypeScriptCompile(ts_cwd, outputDir) {
  try {
    const tsConfigPath=path.join(ts_cwd,'tsconfig.json');
    const command = `tsc --outDir "${outputDir}" --project "${tsConfigPath}"`;
    console.log(command)
    cp.execSync(command, {
      cwd: ts_cwd,
      stdio: 'inherit',
      shell: true
    });

    return true;
  } catch (err) {
    throw `❌ TypeScript compile failed: ${err.message}`;
  }
}
async function compileNodeBackendEnd(cwd,webpackOut,tscOut){
    const node_modules_exists=dirExists(path.join(cwd,'node_modules'));
    const package_json_exists=fileExists(path.join(cwd,'package.json'));
    let npmInit
    if(package_json_exists){
        if(!node_modules_exists) {
            npmInit=await npmInstall(cwd);
            if(npmInit!==true){
                return {
                    success:false,
                    message:"Failed to run npm install.",
                    err:npmInit
                }
            }
        }
        console.log("Compiling Frontend.")
        let ts_C= await runTypeScriptCompile(cwd,tscOut);
        console.log(ts_C)
        // process.exit()
        if(ts_C===true){
            try {
                await minifyNodeJS(path.join(tscOut,'index.js'),webpackOut);
                return {
                        success:true,
                        loc:path.join(webpackOut,'built.js'),
                        message:"Backend Compiled.",
                    }
            } catch (error) {
                return {
                        success:false,
                        message:"Failed to minify node project.",
                    }
            }
        }else{
            if(npmInit==null){
                console.log("Backend compilation failed. Trying to install missing dependencies.")
                npmInit=await npmInstall(loc);
                if(npmInit===true){
                    ts_C=await runTypeScriptCompile(cwd,tscOut);
                    if(ts_C===true){
                        try {
                            await minifyNodeJS(path.join(tscOut,'index.js'),webpackOut);
                            return {
                                    success:true,
                                    loc:path.join(webpackOut,'built.js'),
                                    message:"Backend Compiled.",
                                }
                        } catch (error) {
                            return {
                                    success:false,
                                    message:"Failed to minify node project.",
                                }
                        }
                    }else{
                        return {
                            success:false,
                            message:"Backend Compilation failed.",
                            err:ts_C
                        }
                    }

                }else{
                    return {
                        success:false,
                        message:"Failed to run npm install.",
                        err:npmInit
                    }

                }
            }else{
                return {
                    success:false,
                    message:"Backend Compilation failed, manually check for errors.",
                    err:npmInit
                }
            }
        }
        
    }else{
        return {
            success:false,
            message:"Frontend is not properly initialized. 1",
        }
    }
}
function buildNodeEXE(id,exe,srcFile){
    try {
        const seaConfigFile=path.join(exe,'sea-config.json')
        const blobOutPath=path.join(exe,"sea-prep.blob")
        fs.writeFileSync(seaConfigFile,
            JSON.stringify({
                main: srcFile,
                output: blobOutPath
            },undefined,2)
            )
        cp.execSync(`node --experimental-sea-config "${seaConfigFile}"`, {
            cwd: exe,
            stdio: 'inherit',
            shell: true
        });
        const exeFilePath=path.join(exe,`${id}.exe`)
        // TODO Change this if compiled to exe.
        fs.copyFileSync(process.execPath, exeFilePath);
        cp.execSync(`npx postject "${exeFilePath}" NODE_SEA_BLOB "${blobOutPath}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`, {
            cwd: exe,
            stdio: 'inherit',
            shell: true
        });
        return true;
    } catch (error) {
        console.log(error)
        return false
    }
}
async function buildNodeBackendEnd(id,cwd,webpackOut,tscOut,exe) {
    const cc=await compileNodeBackendEnd(cwd,webpackOut,tscOut)
    if(cc.success){
        try {
            if(buildNodeEXE(id,exe,cc.loc)){
                 return {
                        success:true,
                        message:"Backend build complete.",
                    }
            }
            else{
                 return {
                        success:false,
                        message:"Failed to buildNodeEXE.",
                        err:'buildNodeEXE'
                    }
            }
        } catch (error) {
            return {
                        success:false,
                        message:"Failed to buildNodeEXE 2.",
                        err:error
                    }

        }
    }else{
        return {
                        success:false,
                        message:"Failed to compile backend.",
                        err:error
                    }
    }
}
function checkForDotEnvAndInstall(cwd,venvPath){
    try {
        if(!fs.existsSync(venvPath)){
            cp.execSync(`python -m venv .env`, {
                cwd: cwd,
                stdio: 'inherit',
                shell: true
            });
            cp.execSync(`"${path.join(venvPath,"Scripts", "python.exe")}" install -r requirements.txt`, {
                cwd: cwd,
                stdio: 'inherit',
                shell: true
            });
            return 'OK';
        }else{
            return "OK";
        }
    } catch (error) {
        return "ERR";
    }
}
function getFileHash(filePath, algorithm = "sha256") {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}
async function buildPython(cwd,version) {
    try {
        const venvPath=path.join(cwd,'.env');
        const venvCheck=checkForDotEnvAndInstall(cwd,venvPath);
        if(venvCheck=='OK'){
            cp.execSync(`"${path.join(venvPath,"Scripts", "python.exe")}" setup.py --quiet ${version} build`, {
                cwd: cwd,
                stdio: 'inherit',
                shell: true
            });
            return {
                success:true,
                message: "OK"
            }
        }
    } catch (error) {
        return {
                success:false,
                message: "Python compilation failed."
            }
    }
}

async function runFrontEndCompileCommand(f_cwd,output){
    try {
        console.log('Foutput', output)
        cp.execSync(`npx vite build --outDir "${output}"`, {
        cwd: f_cwd,
        stdio: 'inherit', // stream output directly to console
        shell:true
        });
        return true;
    } catch (err) {
        return err.message;
    }
}
async function npmInstall(f_cwd){
  try {
    cp.execSync('npm.cmd i', {
      cwd: f_cwd,
      stdio: 'inherit', // stream output directly to console
      shell:true
    });
    return true  
  } catch (err) {
      return err.message;
  }
}

async function compileFrontEnd(loc,out){
    const node_modules_exists=dirExists(path.join(loc,'node_modules'));
    const package_json_exists=fileExists(path.join(loc,'package.json'));
    let npmInit
    if(package_json_exists){
        if(!node_modules_exists) {
            npmInit=await npmInstall(loc);
            if(npmInit!==true){
                return {
                    success:false,
                    message:"Failed to run npm install.",
                    err:npmInit
                }
            }
        }
        console.log("Compiling Frontend.")
        let front_C=await runFrontEndCompileCommand(loc,out);
        console.log(front_C)
        // process.exit()
        if(front_C===true){
            return {
                    success:true,
                    message:"Frontend Compiled.",
                }
        }else{
            if(npmInit==null){
                console.log("Frontend compilation failed. Trying to install missing dependencies.")
                npmInit=await npmInstall(loc);
                if(npmInit===true){
                    front_C=runFrontEndCompileCommand(loc,out);
                    if(front_C===true){
                        return {
                            success:true,
                            message:"Frontend Compiled.",
                        }
                    }else{
                        return {
                            success:false,
                            message:"Frontend Compilation failed.",
                            err:front_C
                        }
                    }

                }else{
                    return {
                        success:false,
                        message:"Failed to run npm install.",
                        err:npmInit
                    }

                }
            }else{
                return {
                    success:false,
                    message:"Frontend Compilation failed, manually check for errors.",
                    err:npmInit
                }
            }
        }
        
    }else{
        return {
            success:false,
            message:"Frontend is not properly initialized. 1",
        }
    }
}
async function connectScp(host,username,password,port=22) {
    const client = await scp.Client({
        host: host,
        username: username,
        password: password,
        port: 22
    });
    return client
}
async function uploadFile(from,to,fileName,scp_client) {
    console.log(path.join(path.basename(from)))
    const finalTo=`/var/www/files/modules/${to}`
    const exits=await scp_client.exists(finalTo)
    console.log(to,exits)
    if(exits!='d'){
        await scp_client.mkdir(finalTo,{recursive:false}); 
    }
    const fileTo=`${finalTo}/${fileName}`
    console.log(fileTo)
    await scp_client.uploadFile(from,fileTo)
}

async function getProcessInfo(root,token,id) {
    try{
        const res= await axios.get(`${root}/admin/process?id=${id}`,{
            headers:{
                "authorization":`Bearer ${token}`,
            }
        })
        if(res.data.success){
            const d=res.data.item
            return {
                        Name:d.Name,
                        _id:d._id,
                        versions:{
                            latest:d.versions?.latest,
                            required:d.versions?.required,
                            url:d.versions?.url,
                            zipHash:d.versions?.zipHash,
                            exeHash:d.versions?.exeHash
                        },
                        Prices:d.Prices,
                        lastUpdatedBy:d.updatedBy?.Name,
                        lastUpdatedByAt:(new Date(res.data.item.updated_at)).toString()
                    }
        }else{
            console.log(res.data)
            throw "";
        }
    }catch(err){
        if(err.response){
            if(err.response.status==450){
                throw new Error('API Key Expired.')
            }else{
                throw new Error('Error at get process id. '+err.response?.data?.message)
            }
        }
        throw new Error('Opps. Unexpected error during get process.')
    }
}
async function updateProcessInfo(root,token,id,version,url) {
    try{
        const res= await axios.patch(`${root}/admin/process`,{
            
            "versions": {
                "latest": version,
                "required": version,
                "url": url
            },
            "id": id

        },{
            headers:{
                "authorization":`Bearer ${token}`,
            }
        })
        if(res.data.success){
            const d=res.data.item
            return d
        }else{
            console.log(res.data)
            throw "";
        }
    }catch(err){
        if(err.response){
            if(err.response.status==450){
                throw new Error('API Key Expired.')
            }else{
                throw new Error('Error at get process id. '+err.response?.data)
            }
        }
        throw new Error('Opps. Unexpected error during get process.')
    }
}

function getDotInfo(cwd) {
    try{
        const p= JSON.parse(fs.readFileSync(path.join(cwd,'.info')).toString());
        if(p.id==null)   throw "Id not found.";
        return p
    }catch{
        throw new Error('Error getting .info file.')
    }
}
function incrementVersion(v=''){
    const vSplit=v.split('.');
    vSplit[vSplit.length-1]=String(Number(vSplit[vSplit.length-1])+1)
    return vSplit.join('.');
}
function makeRequiredDirs(root,environment='nodeJS'){
    console.log()
    const log=makeDirIfNotExist(path.join(root,'log'));
    const archive=makeDirIfNotExist(path.join(root,'Archive'));
    const ui=makeDirIfNotExist(path.join(root,'UI'));
    if(environment=='nodeJS'){
        const tsc=makeDirIfNotExist(path.join(root,'tsc'));
        const webpack=makeDirIfNotExist(path.join(root,'webpack'));
        const exe=makeDirIfNotExist(path.join(root,'exe'));
        return {
            mode:'nodeJS',
            log,
            archive,
            ui,
            tsc,
            webpack,
            exe
        }
    }else{
        return {
            mode:'python',
            log,
            archive,
            exe:path.join(root,'exe.win-amd64-3.10'),
            ui
        }

    }
}

function includeFiles(cwd,to,commands=[]){
    for(let c of commands){
        if(c.type=="dir"){
            fs.cpSync(path.resolve(cwd,c.from),path.resolve(to,c.to),{
                recursive:true
            });
        }else if(c.type=='file'){
            fs.copyFileSync(path.resolve(cwd,c.from),path.resolve(to,c.to))
        }
    }

}
function packageModule(cwd,env,majorVersion,id,includedFiles=[]){
    const files=[]
    includedFiles.forEach(e=>files.push(e))
    const pathR= makeDirIfNotExist(path.join(cwd,'build',id))
    if(majorVersion=='2'){
            files.push({
                type:"dir",
                from:'./build/UI',
                to:'./UI'
            })
    }
    if(env=="nodeJS"){
        files.push({
            type:"file",
            from:`./build/exe/${id}.exe`,
            to:`./${id}.exe`
        })
        
    }else if(env=='python'){
        files.push({
            type:"dir",
            from:`./build/exe.win-amd64-3.10`,
            to:``
        })
    }
    includeFiles(cwd,pathR,files);
}
function makeDotInfoFile(id,name,version,dest){
    fs.writeFileSync(dest,
        JSON.stringify({
        "Name": name,
        "id": id,
        "version": version,
        "type": "EXE",
        "executable": id+".exe",
        "requirements": [
            {
            "type": "File",
            "root": "Workers",
            "loc": [
                "?p_id",
                id+".exe"
            ]
            }
        ]
        },undefined,2)
    )

}
module.exports={
    dirExists,
    fileExists,
    makeDirIfNotExist,
    zipDir,
    loadModule,
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
}