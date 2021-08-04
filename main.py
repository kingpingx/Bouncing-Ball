from turtle import *
import turtle
import random
import math as m

t = Turtle()
s = Screen()

win = turtle.Screen()
win.bgcolor("black")
win.setup(870, 670)
win.title("setup")

t.penup()
s.bgcolor("black")
t.shape("circle")
t.shapesize(3)
t.color("red")
t.speed(10)

# coordinate on any_2position on walls :

w1 = random.randint(-s.canvheight, s.canvheight)
w2 = random.randint(-s.canvwidth, s.canvwidth)
w3 = random.randint(-s.canvheight, s.canvheight)
w4 = random.randint(-s.canvwidth, s.canvwidth)

# wall 1 for right side, wall 2 for lower side, wall 3 for left side, wall 4 for upper side

wall_1 = (s.canvwidth, w1)
wall_2 = (w2, -s.canvheight)
wall_3 = (-s.canvwidth, w3)
wall_4 = (w4, s.canvheight)

# list of all walls

l1 = [wall_1, wall_2, wall_3, wall_4]

# first point of line

pos1 = t.pos()

# choice is used to move ball towards any_2direction, it will have coordinate's of a random wall

choice = random.choice(l1)


# while choice[0] == choice[1]:
#     choice = random.choice(l1)


# angling to function to find angle between two lines which are actually forming by 2 coordinates of choice and origin

def angling(x2, y2, x1, y1):
    angle = 1
    if x2 > 0 and y2 > 0:
        if (s.canvwidth - 1 < x2 < s.canvwidth + 1) and y2 < s.canvheight:
            m1 = (y2 - y1) / (x2 - x1)
            m2 = 999999999
            angle = abs(float((m2 - m1) / (1 - (m1 * m2))))

        elif x2 < s.canvwidth and (s.canvheight - 1 < y2 < s.canvheight + 1):
            m1 = (y2 - y1) / (x2 - x1)
            m2 = 0
            angle = abs(float((m2 - m1) / (1 - (m1 * m2))))

    elif x2 > 0 and y2 < 0:
        if (s.canvwidth - 1 < x2 < s.canvwidth + 1) and y2 < 0:
            m1 = (y2 - y1) / (x2 - x1)
            m2 = 999999999
            angle = abs(float((m2 - m1) / (1 - (m1 * m2))))

        elif x2 < s.canvwidth and (-s.canvheight - 1 < y2 < -s.canvheight + 1):
            m1 = (y2 - y1) / (x2 - x1)
            m2 = 0
            angle = abs(float((m2 - m1) / (1 - (m1 * m2))))

    elif x2 < 0 and y2 > 0:
        if (-s.canvwidth - 1 < x2 < -s.canvwidth + 1) and y2 < s.canvheight:
            m1 = (y2 - y1) / (x2 - x1)
            m2 = 999999999
            angle = abs(float((m2 - m1) / (1 - (m1 * m2))))

        elif x2 > -s.canvwidth and (s.canvheight - 1 < y2 < s.canvheight + 1):
            m1 = (y2 - y1) / (x2 - x1)
            m2 = 0
            angle = abs(float((m2 - m1) / (1 - (m1 * m2))))

    elif x2 < 0 and y2 < 0:
        if (-s.canvwidth - 1 < x2 < -s.canvwidth + 1) and y2 < 0:
            m1 = (y2 - y1) / (x2 - x1)
            m2 = 999999999
            angle = abs(float((m2 - m1) / (1 - (m1 * m2))))

        elif x2 > -s.canvwidth and (-s.canvheight - 1 < y2 < -s.canvheight + 1):
            m1 = (y2 - y1) / (x2 - x1)
            m2 = 0
            angle = abs(float((m2 - m1) / (1 - (m1 * m2))))

    print("angle=", angle, "x1=", x1, "y1=", y1, "x2=", x2, "y2=", y2, "choice=", choice)
    rad = m.atan(angle)
    deg = (rad * (180 / m.pi))
    print(deg, m.atan(angle))
    return 2 * deg


# direction function to give direction to ball

def direction(x_2, y_2, x_1, y_1):
    global pos1
    if ((s.canvwidth - 1) < x_2 < (s.canvwidth + 1) and (s.canvheight - 1) < y_2 < (s.canvheight + 1)) and (
            (x_1 == 0 and y_1 == 0) or (-s.canvwidth - 1 < x_1 < -s.canvwidth + 1) and (-s.canvheight - 1 < y_1 < -s.canvheight + 1)):
        t.right(180)

    elif ((-s.canvwidth - 1 < x_2 < -s.canvwidth + 1) and (s.canvheight-1 < y_2 < s.canvheight + 1)) and (
            (x_1 == 0 and y_1 == 0) or ((s.canvwidth - 1) < x_1 < (s.canvwidth + 1) and (-s.canvheight - 1 < y_1 < -s.canvheight + 1))):
        t.right(180)

    elif ((s.canvwidth - 1) < x_2 < (s.canvwidth + 1) and (-s.canvheight - 1 < y_2 < -s.canvheight + 1)) and (
            (x_1 == 0 and y_1 == 0) or ((s.canvwidth - 1) < x_1 < (s.canvwidth + 1)  and (s.canvheight - 1) < y_1 < (s.canvheight + 1))):
        t.right(180)

    elif ((-s.canvwidth - 1) < x_2 < (-s.canvwidth + 1) and (-s.canvheight - 1 < y_2 < -s.canvheight + 1)) and (
            (x_1 == 0 and y_1 == 0) or ((s.canvwidth - 1) < x_1 < (s.canvwidth + 1) and (s.canvheight-1 < y_1 < s.canvheight + 1))):
        t.right(180)

    # for wall 1 (right wall)

    elif (s.canvwidth - 1) < x_2 < (s.canvwidth + 1):
        ans = angling(x_2, y_2, x_1, y_1)
        if y_2 >= 0 and y_2 >= y_1:
            t.left(ans)
            pos1 = t.pos()
            print("U-H-L")

        elif 0 <= y_2 <= y_1:
            t.right(ans)
            pos1 = t.pos()
            print("U-H-R")

        elif y_2 < 0 and y_2 < y_1:
            t.right(ans)
            pos1 = t.pos()
            print("L-H-R")

        elif 0 > y_2 > y_1:
            t.left(ans)
            pos1 = t.pos()
            print("L-H-L")

        t.forward(2)
        print("working1")

    # for wall 3 (left wall)

    elif (-s.canvwidth - 1) < x_2 < (-s.canvwidth + 1):
        ans = angling(x_2, y_2, x_1, y_1)
        if y_2 > 0 and y_2 > y_1:
            t.right(ans)
            pos1 = t.pos()
            print("L-H-R")

        elif 0 < y_2 < y_1:
            t.left(ans)
            pos1 = t.pos()
            print("L-H-L")

        elif y_2 < 0 and y_2 < y_1:
            t.left(ans)
            pos1 = t.pos()
            print("U-H-L")

        elif 0 > y_2 > y_1:
            t.right(ans)
            pos1 = t.pos()
            print("U-H-R")

        t.forward(2)
        print("working2")

    # for wall 4 (upper wall)

    elif (s.canvheight - 1) < y_2 < (s.canvheight + 1):
        ans = angling(x_2, y_2, x_1, y_1)
        if x_2 > 0 and x_2 > x_1:
            t.right(ans)
            pos1 = t.pos()
            print("P-H-R")

        elif 0 < x_2 < x_1:
            t.left(ans)
            pos1 = t.pos()
            print("P-H-L")


        elif x_2 < 0 and x_2 < x_1:
            t.left(ans)
            pos1 = t.pos()
            print("N-H-L")

        elif 0 > x_2 > x_1:
            t.right(ans)
            pos1 = t.pos()
            print("N-H-R")

        t.forward(2)
        print("working3")

    # for wall 2 (lower wall)

    elif (-s.canvheight - 1) < y_2 < (-s.canvheight + 1):
        ans = angling(x_2, y_2, x_1, y_1)
        if x_2 > 0 and x_2 > x_1:
            t.left(ans)
            pos1 = t.pos()
            print("P-H-L")

        elif 0 < x_2 < x_1:
            t.right(ans)
            pos1 = t.pos()
            print("P-H-R")

        elif x_2 < 0 and x_2 < x_1:
            t.right(ans)
            pos1 = t.pos()
            print("N-H-R")

        elif 0 > x_2 > x_1:
            t.left(ans)
            pos1 = t.pos()
            print("N-H-L")

        t.forward(2)
        print("working4")


# calling for first move

direction(choice[0], choice[1], pos1[0], pos1[1])

while 1:
    t.forward(1)
    pos = t.pos()
    x = pos[0]
    y = pos[1]
    direction(x, y, pos1[0], pos1[1])
    print(t.pos(), pos1[0], pos1[1])






























