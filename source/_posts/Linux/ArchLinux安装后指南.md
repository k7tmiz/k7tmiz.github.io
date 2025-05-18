---
title: ArchLinux安装后指南
tags: Linux
abbrlink: f48c939a
categories:
  - Linux
date: 2025-04-23 19:06:38
---

# ArchLinux安装后指南

## root登录

 #联网,基于之前装的NetworkManager 

 ```systemctl start NetworkManager #这里必须大写```

 #开机自启动 ```systemctl enable NetworkManager```

 ```nmtui```

 #触摸板驱动 ```pacman -S xf86-input-synaptics```

 #X11 ```pacman -S xorg```

 #Wayland ```pacman -S wayland xorg-xwayland```

> NVIDIA 多装一个```xorg-xrandr```

 #开源中文字体安装 ```pacman -S ttf-dejavu wqy-microhei```

 #安装sudo ```pacman -S sudo```



## 添加用户并且提权

 #添加用户 ```useradd -m -G wheel Bruno```

 #密码 ```passwd Bruno```

 ```visudo``` 或者 ```nano /etc/sudoers```

> 找到#%wheel ALL=(ALL)ALL 按X去掉# :wq 保存退出

 #重启 ```reboot```



## 重启进来用user登录

 #intel核显驱动 ```sudo pacman -S xf86-video-intel```



## 安装桌面环境

> 本人是KDE的忠实教徒，如需其他桌面，请自行搜索

 #Plasma ```sudo pacman -S plasma kde-applications```

> 最小Plasma桌面 plasma-meta

 #锁屏 ```sudo pacman -S sddm```

 #开机自启动设置 ```systemctl enable sddm```

 #笔记本电源管理 ```sudo pacman -S power-profiles-daemon``` (需要启用 ```power-profiles-daemon``` 服务)

## 一些驱动

 #音频 ```sudo pacman -S alsa-utils pipewire pipewire-alsa pipewire-pulse```

> 有可能装完还是用不了，我这里为了方便，直接一站式，有可能需要装`sof-firmware`--开源音频驱动

 #中文输入法 ```sudo pacman -S fcitx fcitx-rime fcitx-im kcm-fcitx```

 #Sunpinyin ```sudo pacman -S fcitx-sunpinyin```

 #Sogoupinyin ```sudo pacman -S fcitx-sogoupinyin```

 #编辑 ~/.xprofile文件

````

export GTK*IM*MODULE=fcitx

export QT*IM*MODULE=fcitx

export XMODIFIERS=@im=fcitx

````



## ArchLinuxCN镜像源以及AUR

**编辑/etc/pacman.conf**
```
[archlinuxcn]
Server = https://mirrors.cernet.edu.cn/archlinuxcn/$arch
```

**之后通过以下命令安装 archlinuxcn-keyring 包导入 GPG key**
```
sudo pacman -Sy archlinuxcn-keyring
```

 ### 安装AUR包管理器
 ```
 sudo pacman -Sy yay paru
 ``` 
 
