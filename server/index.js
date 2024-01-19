const express = require('express');
const path = require('path');
const multiparty = require('multiparty');
const fse = require('fs-extra');
const cors = require("cors");
const bodyParser = require('body-parser');

//__dirname:表示当前目录下
const UPLOAD_DIR = path.resolve(__dirname,'uploads')

const app = express();

// 提取文件后缀名
const extractExt = filename => {
	return filename.slice(filename.lastIndexOf('.'), filename.length)
}
app.use(bodyParser.json());
app.use(cors());


app.post('/upload', function(req,res){
  const form = new multiparty.Form()
  form.parse(req,async(err,fields,files)=>{
    if(err){
      res.status(401).json({
        ok:false,
        msg:'上传失败，请重新上传'
      })
      return
    }

    const fileHash = fields['fileHash'][0]
    const chunkHash = fields['chunkHash'][0]

    //临时存放目录
    const chunkPath = path.resolve(UPLOAD_DIR,fileHash)
    if(!fse.existsSync(chunkPath)){
      await fse.mkdirs(chunkPath)
    }
    const oldPath = files['chunk'][0]['path']
    //这个是将chunkPath与chunkHash连接，文件夹/文件
    // console.log("333",path.resolve(chunkPath,chunkHash))
    //将切片放进文件夹里面
    await fse.move(oldPath,path.resolve(chunkPath,chunkHash))

    res.status(200).json({
      ok:true,
      msg:'上传成功'
    })
  })
})

app.post('/merge',async function(req,res){
  const {fileHash,fileName,size} = req.body

  //如果已经存在该文件，就没必要合并了
  //完整的文件路径
  const filePath = path.resolve(UPLOAD_DIR,fileHash+extractExt(fileName))
  const chunkDir = path.resolve(UPLOAD_DIR,fileHash)
  if (fse.existsSync(filePath)){
    res.status(200).json({
      ok:true,
      msg:'合并成功'
    })
    return
  }
  //如果不存在文件文件夹，表示没有上传成功
  if (!fse.existsSync(chunkDir)){
    res.status(401).json({
      ok:false,
      msg:'合并失败，请重新上传'
    })
    return
  }
  //合并操作
  const chunkPaths = await fse.readdir(chunkDir)
  chunkPaths.sort((a,b)=>{
    return a.split('-')[1]-b.split('-')[1];
  })
  const list = chunkPaths.map((chunkName,index)=>{
    return new Promise(resolve=>{
      const chunkPath = path.resolve(chunkDir,chunkName)
      const readStream = fse.createReadStream(chunkPath)
      const writeStream = fse.createWriteStream(filePath,{
        start:index*size,
        end:(index+1)*size
      })
      readStream.on('end',async()=>{
        //删除分片文件
        await fse.unlink(chunkPath)
        resolve()
      })
      readStream.pipe(writeStream)
    }) 
  })
  await Promise.all(list)
  fse.rmdirSync(chunkDir)
  res.status(200).json({
    ok:true,
    msg:'合并成功'
  }) 
})
app.post('/verify',async function(req,res){
  const {fileHash,fileName} =req.body

  const filePath = path.resolve(UPLOAD_DIR,fileHash+extractExt(fileName))
  
  // 返回服务器上已经上传成功的切片
  const chunkDir = path.join(UPLOAD_DIR,fileHash)
  let chunkPaths = []
  if (fse.existsSync(chunkDir )){
    chunkPaths = await fse.readdir(chunkDir)
  }
  //如果文件存在，不用上传了
  if (fse.existsSync(filePath)){
    res.status(200).json({
      ok:true,
      data:{
        shouldUpload:false
      }
    })
  }else{
    res.status(200).json({
      ok:true,
      data:{
        shouldUpload:true,
        existChunks:chunkPaths
      }
    })
  }
  
})
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});