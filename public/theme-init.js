(function(){try{
if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true)document.documentElement.dataset.installedApp='true';
var t=localStorage.getItem('maddy-theme')||'dark';
var mq=window.matchMedia('(prefers-color-scheme: light)');
var apply=function(light){document.documentElement.classList.toggle('light',light)};
apply(t==='light'||(t==='system'&&mq.matches));
mq.addEventListener?mq.addEventListener('change',function(e){var p=localStorage.getItem('maddy-theme')||'dark';if(p==='system')apply(e.matches)}):0;
}catch(e){}})();
