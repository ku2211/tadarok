import Workspace from '../workspace';
export const metadata={title:'جرّب تدارك بدون حساب'};
export default function Trial(){return <Workspace signedIn={true} signInPath='/signin-with-chatgpt?return_to=%2F' trial/>;}
