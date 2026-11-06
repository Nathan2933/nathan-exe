from PIL import Image,ImageDraw,ImageFont,ImageFilter
import json, math
from pathlib import Path
root=Path(__file__).resolve().parents[1]
level=json.loads((root/'web/public/data/level.json').read_text())
W,H=1660,1130
im=Image.new('RGB',(W,H),'#101a23');d=ImageDraw.Draw(im)
fontbase='/usr/share/fonts/truetype'
inter='/usr/share/fonts/opentype/inter'
fontbold=f'{inter}/InterDisplay-Bold.otf'
fontreg=f'{inter}/Inter-Regular.otf'
if not Path(fontreg).exists(): fontreg='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
def F(n,bold=False): return ImageFont.truetype(fontbold if bold else fontreg,n)
# canvas frame
d.rounded_rectangle((45,40,W-45,H-45),radius=32,outline='#39434b',width=2,fill='#14212a')
d.rectangle((45,40,53,H-45),fill='#e8b77c')
d.text((90,78),'NATHAN.EXE',font=F(59,1),fill='#f5eede')
d.text((92,146),'THE FOUR CHAPTERS  /  WORLD MASTERPLAN  /  V1.0',font=F(18,1),fill='#a7bac2')
d.text((1475,90),'DESIGN SHEET',font=F(15,1),fill='#eab67f')
d.text((1464,120),'01  /  01',font=F(14,1),fill='#afbec2')
# map bounds
mx,my=100,227; size=822
scale=size/180
def xy(x,y): return mx+size/2+x*scale,my+size/2-y*scale
bcol='#97ac8a'
d.rounded_rectangle((mx-4,my-4,mx+size+4,my+size+4),radius=14,fill='#7b9281',outline='#e8e6d28a',width=4)
d.rectangle((mx,my,mx+size,my+size),fill=bcol)
for x,y,clr in [(47,47,'#c1d2cf'),(-47,-47,'#748f7c'),(47,-47,'#a8b99b')]:
    px,py=xy(x,y)
    side=71*scale/2
    d.rectangle((px-side,py-side,px+side,py+side),fill=clr)
# world grid
for i in range(-75,76,15):
    ax,ay=xy(i,-90);bx,by=xy(i,90)
    d.line((ax,ay,bx,by),fill='#e9efdf18',width=1)
    ax,ay=xy(-90,i);bx,by=xy(90,i)
    d.line((ax,ay,bx,by),fill='#e9efdf18',width=1)
# roadway and footpaths
road=12*scale
ax,ay=xy(-90,0);bx,by=xy(90,0)
d.line((ax,ay,bx,by),fill='#495562',width=int(road))
ax,ay=xy(0,-90);bx,by=xy(0,90)
d.line((ax,ay,bx,by),fill='#495562',width=int(road))
for i in range(-79,80,13):
    if abs(i)>15:
        cx,cy=xy(i,0); d.rounded_rectangle((cx-13,cy-1.5,cx+13,cy+1.5),radius=1,fill='#f0e2b5')
        cx,cy=xy(0,i); d.rounded_rectangle((cx-1.5,cy-13,cx+1.5,cy+13),radius=1,fill='#f0e2b5')
for z in level['buildings']:
  x,y=z['x'],-z['z']; sy=1 if y>0 else -1
  front=y-sy*z['depth']/2
  a=xy(x,0);b=xy(x,front)
  d.line((a,b),fill='#d8d2c1',width=int(5.2*scale))
  d.line((a,b),fill='#efeadc',width=2)
# trees peripheral
for x,y in [(-78,74),(-69,79),(-27,78),(-22,64),(-79,25),(-78,12),(-75,-72),(-22,-76),(-78,-27),(77,78),(77,27),(22,78),(28,68),(77,-76),(23,-76),(76,-29),(78,-10),(22,-28),(-37,-76),(41,77),(75,11),(-28,23),(-29,-26),(28,25),(-27,40)]:
    px,py=xy(x,y)
    d.ellipse((px-12,py-10,px+12,py+11),fill='#3e765c',outline='#285c50',width=2)
    d.ellipse((px-6,py-11,px+5,py+1),fill='#76a788')
# plaza
px,py=xy(0,0)
d.ellipse((px-12*scale,py-12*scale,px+12*scale,py+12*scale),fill='#e0cbb0',outline='#f2e5c0',width=5)
monx,mony=xy(0,4);d.regular_polygon((monx,mony,13),6,rotation=30,fill='#2c4651')
d.text((px,py+17),'START',font=F(13,1),anchor='mm',fill='#24313b')
# zone cards
zones={
'fitness':('#c88b64','01','THE GRIND','GYM + WORKOUT DECK'),
'russia':('#9fbac8','02','THE DETOUR','UNIVERSITY + SNOW'),
'projects':('#5faba6','03','BUILD LAB','GARAGE + PROJECT PODS'),
'future':('#948fc0','04','NEXT MISSION','CAREER + CONTACT')}
for b in level['buildings']:
 x,y=xy(b['x'],-b['z']);w,h=b['width']*scale,b['depth']*scale
 color,n,title,desc=zones[b['id']]
 d.rounded_rectangle((x-w/2+5,y-h/2+8,x+w/2+5,y+h/2+8),radius=9,fill='#32404c')
 d.rounded_rectangle((x-w/2,y-h/2,x+w/2,y+h/2),radius=8,fill=color,outline='#293c43',width=3)
 d.rounded_rectangle((x-w/2+12,y-h/2+10,x+w/2-12,y+h/2-10),radius=6,outline='#fff5db99',width=2)
 d.rounded_rectangle((x-w/2+14,y-h/2+14,x-w/2+47,y-h/2+42),radius=5,fill='#223642')
 d.text((x-w/2+30,y-h/2+28),n,font=F(16,1),anchor='mm',fill='#f8f0d8')
 d.text((x,y+1),title,font=F(19,1),anchor='mm',fill='#152933',stroke_width=0)
 d.text((x,y+29),desc,font=F(10,1),anchor='mm',fill='#263741')
 marker=next(i for i in level['interactions'] if i['id']==b['id'])
 mx1,my1=xy(marker['x'],-marker['z'])
 d.ellipse((mx1-10,my1-10,mx1+10,my1+10),fill='#f7ecd6',outline='#192e38',width=3)
 d.ellipse((mx1-3,my1-3,mx1+3,my1+3),fill=color)
# north arrow
d.rounded_rectangle((120,248,181,333),radius=8,fill='#172934d6',outline='#81949a',width=2)
d.text((150,263),'N',font=F(18,1),anchor='mm',fill='#eff0e9')
d.polygon([(150,280),(139,314),(150,305),(161,314)],fill='#e7b57e')
# legend
rx=1000
D='#e9eae2'; MUT='#a9b9ba'
d.text((rx,252),'YOUR STORY,',font=F(34,1),fill=D)
d.text((rx,293),'BUILT AS A WORLD.',font=F(34,1),fill=D)
d.text((rx,359),'A compact, walkable neighborhood with four',font=F(19),fill=MUT)
d.text((rx,390),'purposeful places. Every destination is',font=F(19),fill=MUT)
d.text((rx,421),'an interactive chapter of your portfolio.',font=F(19),fill=MUT)
for idx,(id,(color,num,title,desc)) in enumerate(zones.items()):
  yy=506+idx*117
  d.rounded_rectangle((rx,yy,rx+67,yy+66),radius=11,fill=color)
  d.text((rx+34,yy+34),num,font=F(28,1),anchor='mm',fill='#21343e')
  d.text((rx+89,yy+7),title,font=F(24,1),fill=D)
  d.text((rx+90,yy+42),desc,font=F(13,1),fill=MUT)
d.line((995,979,1575,979),fill='#384e5a',width=2)
d.text((1003,1003),'BLENDER X/Y  →  WEB X/Z',font=F(15,1),fill='#e8c08e')
d.text((1003,1036),'EDIT DISTRICT COORDINATES IN build_world.py',font=F(13),fill=MUT)
# margin footer
d.text((99,1074),'WORLD RADIUS: 84m   /   WALKABLE GROUND-LEVEL MAP',font=F(13,1),fill='#a9b9b5')
d.text((1060,1074),'MASTERPLAN PREVIEW — NOT AN IN-GAME SCREENSHOT',font=F(11),fill='#8da0a5')
out=root/'design/map_overview.png';im.save(out,optimize=True)
print('Created',out,im.size)
