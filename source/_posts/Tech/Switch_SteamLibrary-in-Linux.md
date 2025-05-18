---
title: Switch_SteamLibrary-in-Linux
tags: Tech
abbrlink: 2a1b98b0
categories:
  - Tech
date: 2025-04-19 22:28:32
---
# Switch_SteamLibrary-in-Linux

> 这是一个用于电脑中有多Linux系统，并且希望自己的游戏统一存放在NTFS格式盘的小脚本。它旨在可以让你的多Linux系统，包括Windows都可以调用一个同一个Steam游戏库的小脚本。


### 使用说明:

```
git clone https://github.com/k7tmiz/Switch_SteamLibrary-in-Linux.git
```

```
cd Switch_SteamLibrary-in-Linux
```

#### 使用文本编辑器进行编辑

```
sudo vim setup_steam_link.sh
```

**STEAM_DIR**：代表你当前系统steam所在的地址  

**SHARED_DIR**：代表你想调用的游戏库地址  

**只须调整这两个参数便可以正常使用该脚本**  

#### 提权
```
chmod +x ./setup_steam_link.sh
```

#### 运行
```
./setup_steam_link.sh
```

> 参考：[Proton-Wiki](https://github.com/ValveSoftware/Proton/wiki/Using-a-NTFS-disk-with-Linux-and-Windows)
