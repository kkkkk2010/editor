"use client"

import type { Element } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChartIcon as ScatterPlot,
  ScatterChartIcon as RadarChart,
  AreaChart,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface ChartPropertyPanelProps {
  element: Element
  onUpdateElement: (element: Element) => void
}

export default function ChartPropertyPanel({ element, onUpdateElement }: ChartPropertyPanelProps) {
  const updateStyle = (property: string, value: any) => {
    onUpdateElement({
      ...element,
      style: {
        ...element.style,
        [property]: value,
      },
    })
  }

  return (
    <div className="space-y-4">
      <Tabs defaultValue="type">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="type">Тип графика</TabsTrigger>
          <TabsTrigger value="style">Стиль</TabsTrigger>
          <TabsTrigger value="advanced">Дополнительно</TabsTrigger>
        </TabsList>

        <TabsContent value="type" className="space-y-4 mt-4">
          <div>
            <Label>Тип графика</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                className={cn("flex-col h-20 py-2", element.style.chartType === "bar" && "bg-muted")}
                onClick={() => updateStyle("chartType", "bar")}
              >
                <BarChart className="h-8 w-8 mb-1" />
                Столбчатая
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn("flex-col h-20 py-2", element.style.chartType === "line" && "bg-muted")}
                onClick={() => updateStyle("chartType", "line")}
              >
                <LineChart className="h-8 w-8 mb-1" />
                Линейная
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn("flex-col h-20 py-2", element.style.chartType === "pie" && "bg-muted")}
                onClick={() => updateStyle("chartType", "pie")}
              >
                <PieChart className="h-8 w-8 mb-1" />
                Круговая
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn("flex-col h-20 py-2", element.style.chartType === "area" && "bg-muted")}
                onClick={() => updateStyle("chartType", "area")}
              >
                <AreaChart className="h-8 w-8 mb-1" />
                Областная
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn("flex-col h-20 py-2", element.style.chartType === "scatter" && "bg-muted")}
                onClick={() => updateStyle("chartType", "scatter")}
              >
                <ScatterPlot className="h-8 w-8 mb-1" />
                Точечная
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={cn("flex-col h-20 py-2", element.style.chartType === "radar" && "bg-muted")}
                onClick={() => updateStyle("chartType", "radar")}
              >
                <RadarChart className="h-8 w-8 mb-1" />
                Радарная
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="style" className="space-y-4 mt-4">
          <div>
            <Label htmlFor="title">Заголовок графика</Label>
            <Input
              id="title"
              value={element.style.title || ""}
              onChange={(e) => updateStyle("title", e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="color">Основной цвет</Label>
            <div className="flex items-center mt-1 space-x-2">
              <Input
                id="color"
                type="color"
                value={element.style.color || "#3b82f6"}
                onChange={(e) => updateStyle("color", e.target.value)}
                className="w-10 h-10 p-1"
              />
              <Input
                type="text"
                value={element.style.color || "#3b82f6"}
                onChange={(e) => updateStyle("color", e.target.value)}
                className="flex-1"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="showLegend">Показать легенду</Label>
            <Switch
              id="showLegend"
              checked={element.style.showLegend || false}
              onCheckedChange={(checked) => updateStyle("showLegend", checked)}
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="showValues">Показать значения</Label>
            <Switch
              id="showValues"
              checked={element.style.showValues || false}
              onCheckedChange={(checked) => updateStyle("showValues", checked)}
            />
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4 mt-4">
          <div>
            <Label htmlFor="barWidth">Ширина столбца (только для столбчатых)</Label>
            <div className="flex items-center mt-1 space-x-2">
              <Slider
                id="barWidth"
                min={30}
                max={90}
                step={5}
                value={[element.style.barWidth || 70]}
                onValueChange={(value) => updateStyle("barWidth", value[0])}
                className="flex-1"
              />
              <span className="w-10 text-center">{element.style.barWidth || 70}%</span>
            </div>
          </div>

          <div>
            <Label htmlFor="lineWidth">Толщина линии (только для линейных)</Label>
            <div className="flex items-center mt-1 space-x-2">
              <Slider
                id="lineWidth"
                min={1}
                max={10}
                step={1}
                value={[element.style.lineWidth || 2]}
                onValueChange={(value) => updateStyle("lineWidth", value[0])}
                className="flex-1"
              />
              <span className="w-10 text-center">{element.style.lineWidth || 2}px</span>
            </div>
          </div>

          <div>
            <Label htmlFor="gridLines">Сетка</Label>
            <Select
              value={element.style.gridLines || "none"}
              onValueChange={(value) => updateStyle("gridLines", value)}
            >
              <SelectTrigger id="gridLines">
                <SelectValue placeholder="Выберите стиль сетки" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Нет</SelectItem>
                <SelectItem value="horizontal">Горизонтальные</SelectItem>
                <SelectItem value="vertical">Вертикальные</SelectItem>
                <SelectItem value="both">Горизонтальные и вертикальные</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="animation">Включить анимацию</Label>
            <Switch
              id="animation"
              checked={element.style.animation || false}
              onCheckedChange={(checked) => updateStyle("animation", checked)}
            />
          </div>

          <div>
            <Label htmlFor="colorScheme">Цветовая схема</Label>
            <Select
              value={element.style.colorScheme || "single"}
              onValueChange={(value) => updateStyle("colorScheme", value)}
            >
              <SelectTrigger id="colorScheme">
                <SelectValue placeholder="Выберите цветовую схему" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Один цвет</SelectItem>
                <SelectItem value="gradient">Градиент</SelectItem>
                <SelectItem value="categorical">Категориальные</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}