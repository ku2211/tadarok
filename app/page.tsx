import Workspace from './workspace';
import {getChatGPTUser,chatGPTSignInPath} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Page(){const user=await getChatGPTUser();return <Workspace signedIn={!!user} signInPath={chatGPTSignInPath('/')} />;}
