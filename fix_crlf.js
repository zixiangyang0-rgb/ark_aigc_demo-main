const fs = require('fs');
const path = require('path');

const files = [
    "d:/ark_aigc_demo-main-main/src/components/AiChangeCard/index.tsx",
    "d:/ark_aigc_demo-main-main/src/components/AiChangeCard/CheckScene/index.tsx",
    "d:/ark_aigc_demo-main-main/src/components/AiAvatarCard/index.tsx",
    "d:/ark_aigc_demo-main-main/src/pages/MainPage/MainArea/Room/Conversation.tsx",
];

for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    const fixed = content.replace(/\r\n/g, '\n');
    fs.writeFileSync(file, fixed, 'utf8');
    console.log('Fixed LF:', file);
}
