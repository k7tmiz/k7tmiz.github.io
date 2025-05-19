---
title: ArchLinux安装后指南
tags: Linux
abbrlink: f48c939a
categories:
  - Linux
date: 2025-04-23 19:06:38
---

## root登录

#### 联网,基于之前装的NetworkManager

 ```
 systemctl start NetworkManager #这里必须大写
 ```

#### 开机自启动
 ```
 systemctl enable NetworkManager
 ```

 ```
 nmtui
 ```

#### 触摸板驱动
 ```
 pacman -S xf86-input-synaptics
 ```

#### X11
 ```
 pacman -S xorg
 ```

#### Wayland
 ```
 pacman -S wayland xorg-xwayland
 ```

> NVIDIA 多装一个 `xorg-xrandr`

#### 开源中文字体安装
 ```
 pacman -S ttf-dejavu wqy-microhei wqy-zenhei
 ```

#### 安装sudo
 ```
 pacman -S sudo
 ```



## 添加用户并且提权

#### 添加用户
 ```
 useradd -m -G wheel Bruno
 ```

#### 密码
 ```
 passwd Bruno
 ```

 ```visudo``` 或者 ```nano /etc/sudoers```

> 找到#%wheel ALL=(ALL)ALL 按X去掉# :wq 保存退出

#### 重启
 ```
 reboot
 ```

**重启进来用user登录**

#### intel核显驱动
 ```
 sudo pacman -S xf86-video-intel
 ```



## 安装桌面环境

> 本人是KDE的忠实教徒，如需其他桌面，请自行搜索

### Plasma
 ```
 sudo pacman -S plasma kde-applications
 ```

> 最小Plasma桌面 plasma-meta

#### 锁屏
 ```
 sudo pacman -S sddm
 ```

向 /etc/sddm.conf 中追加下面的内容。其中，QT_FONT_DPI 的值为你的 DPI 缩放数值 (计算方式是 96 乘以你的缩放比例，比如 150% 缩放则为 `144`)。QT_SCREEN_SCALE_FACTORS 的值为你需要的 DPI 缩放比例（比如，若为 150% 就直接填 `1.5`）,同时 sddm 登录界面不会自动将数字小键盘打开, sddm 的鼠标指针也可以更改一下
```
[General]
GreeterEnvironment=QT_SCREEN_SCALE_FACTORS=1.5,QT_FONT_DPI=144

# 打开数字小键盘
Numlock=on

# 修改鼠标指针，加入下面的设置
[Theme]
CursorTheme=breeze_cursors
```
> 修改完 HiDPI 设置之后可能需要重新启动系统。

#### 开机自启动设置
 ```
 systemctl enable sddm
 ```

#### **笔记本电源管理**
 ```
 sudo pacman -S power-profiles-daemon
 ``` 
 (需要启用 `power-profiles-daemon` 服务)

## 一些驱动

#### 音频
 ```
 sudo pacman -S alsa-utils pipewire pipewire-alsa pipewire-pulse
 ```

> 有可能装完还是用不了，我这里为了方便，直接一站式，有可能需要装`sof-firmware`--开源音频驱动

#### 中文输入法
 ```
 sudo pacman -S fcitx5 fcitx5-chinese-addons fcitx5-configtool fcitx5-gtk fcitx5-qt
 ```

##### Wikipedia中文词库
 ```
 sudo pacman -S fcitx5-pinyin-zhwiki
 ```

##### Sogoupinyin
 ```
 yay -S fcitx5-pinyin-sougou
 ```

编辑 `~/.xprofile` 文件

````

export GTK*IM*MODULE=fcitx

export QT*IM*MODULE=fcitx

export XMODIFIERS=@im=fcitx

````

##### fcitx5类似微软拼音的皮肤
```
sudo pacman -S fcitx5-material-color
```

#### zsh
通过pacman安装zsh，然后将[此文件](../../files/zshrc)的内容覆盖到~/.zshrc中，完成配置。
> - 需要事先安装git命令
>	 - 使用`chsh -s /bin/zsh`来更改当前用户的默认终端

ref:[Archlinux 安装笔记](https://www.bwsl.wang/linux/34.html)

#### rEFInd -- 多系统引导工具
安装 `refind`包
```
sudo pacman -S refind
```

执行安装命令:

```
refind-install
```
然后进入 `boot/EFI/refind` 将[此文件](../../files/refind.conf)覆盖 `refind.conf`
>需要安装darkmini的refind主题才能正常使用，如果不想安装主题或者不想用darkmini，就把最后一行 `include themes/darkmini/theme-mini.conf` 注释掉或者修改成你想使用的主题

ref: [rEFInd](https://wiki.archlinuxcn.org/wiki/REFInd)

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
 
