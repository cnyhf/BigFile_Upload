<template>
  <div>
    <h1>大文件上传</h1>
    <input @change="handleUpload" type="file">
  </div> 
</template>
<script setup lang="ts">
import SparkMD5 from "spark-md5";
import {ref} from 'vue'

//文件分片
// 1MB = 1024KB = 1024*1024B
const CHUNK_SIZE = 1024*1024 //1M
const fileHash = ref<string>('')
const fileName = ref<string>('')
const createChunks = (file:File) =>{
  let cur = 0 //看分到哪了
  let chunks = []
  while(cur< file.size){
    const blob = file.slice(cur,cur+CHUNK_SIZE)
    chunks.push(blob)
    cur+=CHUNK_SIZE
  }
  return chunks
}

//hash计算
const calculateHash = (chunks:Blob[]) =>{
  return new Promise(resolve =>{
     //1、第一个和最后一个切片全部参与计算
    //2、中间的切片只计算前面两个字节、中间两个字节、最后两个字节
    const targets: Blob[] = [] //存储所有参与计算的切片
    const spark = new SparkMD5.ArrayBuffer()
    const fileReader = new FileReader()
    chunks.forEach((chunk,index)=>{
      if(index===0 || index===chunks.length-1){
        //1、第一个和最后一个切片全部参与计算
        targets.push(chunk)
      }else{
        //2、中间的切片只计算前面两个字节、中间两个字节、最后两个字节
        targets.push(chunk.slice(0,2))
        targets.push(chunk.slice(CHUNK_SIZE/2,CHUNK_SIZE/2+2))
        targets.push(chunk.slice(CHUNK_SIZE-2,CHUNK_SIZE))
      }
    })
    fileReader.readAsArrayBuffer(new Blob(targets))
    fileReader.onload = (e) => {
      spark.append((e.target as FileReader).result);   
      // console.log('hash:'+spark.end())
      resolve(spark.end())
    }
  })
}

const mergeRequest = () =>{
  fetch('http://localhost:3000/merge',{
    method:'POST',
    headers:{
      'content-type':'application/json',
    }, 
    body:JSON.stringify({
      fileHash:fileHash.value,
      fileName:fileName.value,
      size:CHUNK_SIZE
    })
  }).then(()=>{
    alert('合并成功了！！！')
  })
}

//上传分片
const uploadChunks = async(chunks:Blob[],existChunks:string[])=>{
  //将分片数据转换成formData形式
  const data = chunks.map((chunk,index)=>{
    return{
      fileHash:fileHash.value,
      chunkHash:fileHash.value+'-'+index,
      chunk
    }
  })
  // console.log(data)
  const formDatas = data
  .filter((item)=> !existChunks.includes(item.chunkHash))
  .map((item)=>{
    const formData = new FormData()
    formData.append('fileHash',item.fileHash)
    formData.append('chunkHash',item.chunkHash)
    formData.append('chunk',item.chunk)
    return formData
  })
  // console.log(formDatas)
  //发送分片请求，一次最大请求数是6
  const max = 6 //最大并发请求数
  let index = 0
  const taskPool :any = [] //请求池,这里使用了any，相当于放弃了类型检查
  //（1）将请求放入请求池
  while(index < formDatas.length){
    const task = fetch('http://localhost:3000/upload',{
      method:'POST',
      body:formDatas[index]
    })
    task.then(() => {
      // 执行完后把当前任务从任务队列中删除
      taskPool.splice(taskPool.findIndex((item: any) => item === task))
    })
    taskPool.push(task)
    //（2）请求池内数量为6时，执行race
    if(taskPool.length === max){
      //等taskPool里有一个完成，promise就标志成已完成，index++
      await Promise.race(taskPool)
    }
    index++
  }
  //等待请求池中所有的都完成
  await Promise.all(taskPool)
  //通知服务器去合并文件
  mergeRequest()
}

//校验hash值
const verify = () =>{
  return fetch('http://localhost:3000/verify',{
      method:'POST',
      headers:{
      'content-type':'application/json',
      }, 
    body:JSON.stringify({
      fileHash:fileHash.value,
      fileName:fileName.value,
    })
  }).then((res)=>res.json())
    .then(res =>{
      return res
    })
}

//大文件上传的整体流程
const handleUpload = async(e: Event)=>{
  // console.log((e.target as HTMLInputElement).files)
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  //读取文件
  // console.log(files[0])
  fileName.value = files[0].name
  //文件分片
  const chunks = createChunks(files[0])
  // console.log(chunks)

  //hash计算
  const hash = await calculateHash(chunks)
  fileHash.value = hash as string 
  
  //校验hash值
  const data = await verify()
  if(!data.data.shouldUpload){
    alert('秒传成功')
    return
  }

  uploadChunks(chunks,data.data.existChunks)
  
}
</script>
<style scoped>
</style>
