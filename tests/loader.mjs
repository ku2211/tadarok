import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve as pathResolve,dirname} from 'node:path';
import ts from 'typescript';
const root=pathResolve(dirname(fileURLToPath(import.meta.url)),'..');
export async function resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'tadarok-test:env',shortCircuit:true};
 if(specifier==='@/app/chatgpt-auth')return {url:'tadarok-test:auth',shortCircuit:true};
 if(specifier.startsWith('@/')||specifier.startsWith('.')){
  const p=specifier.startsWith('@/')?pathResolve(root,specifier.slice(2)):pathResolve(dirname(fileURLToPath(context.parentURL)),specifier);
  for(const suffix of ['', '.ts','.tsx','.mjs'])if(existsSync(p+suffix)&&/\.(ts|tsx|mjs)$/.test(p+suffix))return {url:pathToFileURL(p+suffix).href,shortCircuit:true};
 }
 return next(specifier,context);
}
export async function load(url,context,next){
 if(url==='tadarok-test:env')return {format:'module',source:'export const env=globalThis.__tadarokTestEnv;',shortCircuit:true};
 if(url==='tadarok-test:auth')return {format:'module',source:'export async function getChatGPTUser(){return globalThis.__tadarokTestIdentity;}',shortCircuit:true};
 if(/\.tsx?$/.test(url))return {format:'module',source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};
 return next(url,context);
}
