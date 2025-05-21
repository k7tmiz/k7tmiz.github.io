---
title: MSI-PERKEYRGB
tags: 
		- Msi
		- Linux
abbrlink: 5a88bde
categories:
  - Msi
date: 2025-04-19 22:28:32
---
# MSI-PERKEYRGB

> 适用于我MSI-GP68HX的键盘RGB调光的git项目

下面是Github的项目地址： [msi-perkeyrgb](https://github.com/Askannz/msi-perkeyrgb)

- - -
### 安装教程这里就掠过

### 简单用法

#### Steady Color：稳定颜色

```
msi-perkeyrgb --model <MSI model> -s <COLOR>
```
#### Preset：内置预设(--list-presets)

```
msi-perkeyrgb --model <MSI model> -p <preset>
```
### 高级用法不多赘述 个人用不到

- - -
### 个人电脑键盘预设配色如下：

- aqua
- chakra
- default
- disco
- drain
- freeway
- rainbow-split
- roulette

### 如果你的电脑也没有被录入的话 可以通过id的方式进行使用。

注意：这里是十六进制的数字 --id VENDOR_ID:PRODUCT_ID

```
例 sudo msi-perkeyrgb --id 1038:113a -p rainbow-split
```

