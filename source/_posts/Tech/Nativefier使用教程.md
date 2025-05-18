---
title: Nativefier 使用教程
tags: Tech
abbrlink: b56059f9
categories:
  - Tech
date: 2025-04-19 22:28:32
---
# Nativefier 使用教程

#### 基于electron的打包软件

##### nativefier -n <打包后的应用名称> -p <程序兼容的平台> —-arch <架构> —- weight <窗口宽度> —-height <窗口高度> <网页URL>

#### 实例（Eshelper）

nativefier -n Eshelper -p linux --arch x64 --width 1024 --height 768 --tray
\--disable-dev-tools <https://www.esdict.cn/>

\#如果想让程序可以后台运行，可以增加参数——tray

\#如果不想在使用时可以调出chrome的开发者工具，可以增加参数——disable-dev-tools

\#如果想控制程序在同一时间只能运行一个实例，则增加参数——single-instance

#### .desktop文件（Linux下启动文件）

\[Desktop Entry]

\# type关键字如上所述

Type=Application

\# 本文件所遵循的桌面项规范版本

Version=1.0

\# 应用程序的名称

Name=jMemorize

\# 显示为工具提示的注释

Comment=Flash card based learning tool

\# 可执行文件所在的目录

Path=/opt/jmemorise

\# 可执行文件，可以带参

Exec=jmemorize

\# 图标名称

Icon=jmemorize

\# 应用程序是否需要运行在终端中

Terminal=false

\# 本桌面项将显示在哪些分类中

Categories=Education;Languages;Java;

#### .desktop文件存放位置

/usr/share/applications/

