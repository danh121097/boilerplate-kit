import { Button } from "@/components/ui/button";
import { fireEvent, render, screen } from "@testing-library/react-native";

describe("Button", () => {
  it("renders its label", () => {
    render(<Button>Tap me</Button>);
    expect(screen.getByText("Tap me")).toBeTruthy();
  });

  it("fires onPress when tapped", () => {
    const onPress = jest.fn();
    render(<Button onPress={onPress}>Go</Button>);
    fireEvent.press(screen.getByText("Go"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("does not fire onPress when disabled", () => {
    const onPress = jest.fn();
    render(
      <Button disabled onPress={onPress} testID="btn">
        No
      </Button>,
    );
    fireEvent.press(screen.getByTestId("btn"));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("shows a spinner (hides the label) and blocks press when loading", () => {
    const onPress = jest.fn();
    render(
      <Button loading onPress={onPress} testID="btn">
        Submit
      </Button>,
    );
    expect(screen.queryByText("Submit")).toBeNull();
    fireEvent.press(screen.getByTestId("btn"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
